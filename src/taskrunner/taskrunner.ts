import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
import semaphore, { Semaphore } from "semaphore";
import { Writable } from "stream";
import { createHash } from "crypto";

export class PromisifiedSemaphore {
    _sem : Semaphore;
    readonly capacity : number;
    constructor(num: number) {
        this._sem = semaphore(num);
        this.capacity = num;
    }
    async take() : Promise<void> {
        return new Promise<void>((resolve) => {
            this._sem.take(resolve);
        })
    }
    leave() : void {
        this._sem.leave();
    }
}

export abstract class Task {
    index: number | undefined;
    abstract execute(): Promise<any | undefined>;
}

export class ChunkTask extends Task {
    _buf: Buffer;
    constructor(buf: Buffer, offset?: number, length?: number) {
        super();
        if (offset && length) {
            this._buf = buf.subarray(offset, offset + length);
        } else {
            this._buf = buf;
        }
    }
    async execute(): Promise<any | undefined> {
        return new Promise<string>((resolve) => {
            setTimeout(() => {
                const h = createHash("md5");
                h.update(this._buf);
                resolve(h.digest().toString("hex"));
            }, 0);
        });
    }
}

export class ChunkTaskWritableStream extends Writable {
    _runner: TaskRunner;
    _idx : number = 1;
    _generator: (chunk: Buffer) => Task;

    constructor(runner: TaskRunner, generator: (chunk: Buffer) => Task) {
        super();
        this._runner = runner;
        this._generator = generator;
    }

    _write(chunk: Buffer, enc: string, next: () => void) {
        const wait = async (): Promise<void> => {
            const pending = await this._runner.pending();
            if (pending >= this._runner.numConcurrent) {
                // we are at capacity so wait for the runner to finish a task
                // to continue
                this._runner.once("done", () => {
                    wait();
                });
            } else {
                const t = this._generator(chunk);
                t.index = this._idx;
                this._idx++;
                this._runner.queue(t);
                return next();
            }
        };
        wait();
    }
}

export interface TaskResult {
    task: Task;
    uuid: string;
    result: any | undefined;
    error: any | undefined;
}
export class TaskRunner {
    readonly numConcurrent;
    _eventEmitter = new EventEmitter();
    _errorCallback?: (task: Task, err: any) => boolean;
    _semGate: PromisifiedSemaphore;
    _semState = new PromisifiedSemaphore(1);
    _queued: Task[] = [];
    _pending: TaskResult[] = [];
    _done: TaskResult[] = [];
    _abort: boolean = false;
    _async: boolean | undefined = undefined;

    constructor(numConcurrent: number = 1) {
        this.numConcurrent = numConcurrent;
        this._semGate = new PromisifiedSemaphore(numConcurrent);
    }

    on(eventName: string, handler: (...args: any[]) => void) {
        this._eventEmitter.on(eventName, handler);
    }
    once(eventName: string, handler: (...args: any[]) => void) {
        this._eventEmitter.once(eventName, handler);
    }

    async queued(): Promise<number> {
        await this._semState.take();
        const count = this._queued.length;
        this._semState.leave();
        return count;
    }

    async pending(): Promise<number> {
        await this._semState.take();
        const count = this._pending.length;
        this._semState.leave();
        return count;
    }

    async done(): Promise<number> {
        await this._semState.take();
        const count = this._done.length;
        this._semState.leave();
        return count;
    }

    async queue(task: Task): Promise<void> {
        if (undefined === this._async) throw new Error("Not running");
        if (false === this._async) throw new Error("Not running in async mode");
        await this._semState.take();
        this._queued.push(task);
        this._semState.leave();
        this._eventEmitter.emit("queued", task, this._queued.length);
    }

    /**
     * Returns the results from running the tasks.
     * @returns Array of results or Error's if a task failed
     */
    async results(): Promise<TaskResult[]> {
        await this._semState.take();
        const results = new Array<TaskResult>(...this._done);
        this._semState.leave();
        return results;
    }

    _doCreatePendingTask(task: Task): TaskResult {
        const taskUuid = uuid();
        const pendingTask = {
            uuid: taskUuid,
            task,
            result: undefined,
            error: undefined,
        } as TaskResult;
        return pendingTask;
    }

    async _doTakeTask() {
        await this._semState.take();
        let pendingTask: TaskResult | undefined = undefined;
        if (!this._abort) {
            if (this._queued.length) {
                const task = this._queued.shift()!;
                this._eventEmitter.emit("take", task);
                pendingTask = this._doCreatePendingTask(task);
                this._pending.push(pendingTask);
            } else if (!this._pending.length) {
                // none pending so we must be done
                this._eventEmitter.emit("end");
            }
        }
        this._semState.leave();
        if (pendingTask) return this._doProcessTask(pendingTask);
    }

    async _doProcessTask(pendingTask: TaskResult) {
        await this._semGate.take();
        this._eventEmitter.emit(
            "start",
            pendingTask.task,
            this._queued.length,
            this._pending.length,
            this._done.length
        );
        try {
            pendingTask.result = await pendingTask.task.execute();
        } catch (err) {
            pendingTask.error = err;
            if (this._errorCallback) {
                const rc = this._errorCallback(pendingTask.task, err);
                if (rc) {
                    this._abort = true;
                }
            }
        }
        this._semGate.leave();

        // if abort exit
        if (this._abort) return;

        // update state
        await this._semState.take();

        // emit
        this._eventEmitter.emit(
            "stop",
            pendingTask.error,
            pendingTask.task,
            pendingTask.result, 
            this._queued.length,
            this._pending.length,
            this._done.length
        );

        // update state
        this._pending = this._pending.filter((t) => t.uuid !== pendingTask.uuid);
        this._done.push(pendingTask);
        this._semState.leave();

        // emit
        this._eventEmitter.emit(
            "done",
            pendingTask.error,
            pendingTask.task,
            this._queued.length,
            this._pending.length,
            this._done.length
        );

        if (!this._async) this._doTakeTask();
    }

    async execute(tasks?: Task[]): Promise<void> {
        if (tasks) {
            await this._semState.take();
            this._async = false;
            this._queued = tasks;
            this._semState.leave();
            this._eventEmitter.emit("begin");
            for (let i = 0; i < this._semGate.capacity; i++) {
                this._doTakeTask();
            }
        } else {
            await this._semState.take();
            this._async = true;
            this._semState.leave();
            this._eventEmitter.emit("begin");
            this.on("queued", () => {
                this._doTakeTask();
            });
        }
    }

    /**
     * Should be called if running execute without supplying tasks to be run 
     * to allow the TaskRunner to send the end-event when all queued or pending 
     * jobs are done executing.
     */
    async end() {
        if (undefined === this._async) throw new Error("Not running");
        if (false === this._async) throw new Error("Not running in async mode");

        const emitEnd = () => {
            this._eventEmitter.emit("end");
        }
        const done = async () => {
            await this._semState.take();
            if (!this._queued.length && !this._pending.length) {
                // now we are done
                this._eventEmitter.off("done", done);
                emitEnd();
            }
            this._semState.leave();
        }
        
        await this._semState.take();
        if (!this._queued.length && !this._pending.length) {
            // we are done processing so emit end-event immediately
            emitEnd();
        } else {
            // wait for tasks to be done
            this.on("done", done);
        }
        this._semState.leave();
    }

    setErrorCallback(cb: (task: Task, idx: number) => any | undefined) {
        this._errorCallback = cb;
    }
}
