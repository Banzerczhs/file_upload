import uuid4 from "uuid4";
import axios from "axios";
import type { fileChunk, progressHandler } from "./upload";

type PollOption = {
    max: number,
    tasks?: Array<Payload>,
    auto?: boolean
}

type SendType = {
    http: Promise<any>,
    id: string
}

type Payload = {
    data: any,
    url: string
}

const Status = {
    wait: Symbol('wait'),
    error: Symbol('error'),
    uploading: Symbol('uploading'),
    done: Symbol('done')
}

type Task = {
    status: symbol,
    done: boolean,
    index: number,
    formData: any,
    item: any,
    createProgressHandler: (item:fileChunk)=>progressHandler
}


export class RequestPoll {
    public max: number;
    public tasks: Array<Payload>;
    private queue: Array<SendType>;
    protected auto?: boolean = false;
    constructor(option:PollOption){
        this.max = option.max;
        this.tasks = option.tasks || [];
        this.auto = option.auto;
        this.queue = [];
        
        if(this.auto){
            this.run();
        }
    }

    private uniqueId(){
        return uuid4();
    }
    
    public run(){
        let tasks = this.tasks || [];
        let queue = this.queue;
        
        let task = tasks.shift();
        while(task){
            if(queue.length < this.max){
                let res = this.send(task.url,task.data);
                queue.push(res);
                task = tasks.shift();
            }
        }
    }

    public send(url: string,data?: any): SendType{
        const id = this.uniqueId();
        const requestMethod = data.fetch || (()=>{
            return fetch(url,data).then((res)=>res.json()).finally(()=>{
                this.queue = this.queue.filter(item=>item.id !== id)
            })
        })
            
        return {
            http: requestMethod(),
            id
        }
    }

    public addTask(info:Payload){
        this.tasks.push(info);
        this.run();
    }
}

function buildTask(task:any,index:number):Task{
    return {
        ...task,
        status: Status.wait,
        done: false,
        index
    }
}

export function sendRequest(tasks: Array<any>,max = 4, callback?: (data:any)=>void):Promise<Array<Promise<any>>>{
    let newTasks = tasks.map((task,index)=>{
        return buildTask(task,index);
    });
    let retryLimit = 3;
    
    return new Promise((resolve)=>{
        let cur = 0;
        let len = newTasks.length;
        let result:Array<Promise<any>> = [];
        let retryArr:Array<number> = [];

        const start = ()=>{
            while(cur < len && max > 0){
                let i = newTasks.findIndex((v)=>{
                    if(!retryArr[v.index]){
                        retryArr[v.index] = 0;
                    }
                    if(
                        (v.status === Status.wait ||
                        v.status === Status.error) &&
                        retryArr[v.index] < retryLimit
                    ){
                        return true;
                    }else{
                        return false;
                    }
                });
                let task = newTasks[i];
                if(!task){
                    return;
                }
                max--;
                task.status = Status.uploading;
                let index = task.index;
                if(retryArr[index] >= 1){
                    console.log(`-----retry ${index} 开始重试------`);
                }
                let {formData,createProgressHandler,item} = task;
                let signal=item.controller?.signal;

                result.push(axios.post('/api/uploadFile',formData,{
                    signal,
                    onUploadProgress : createProgressHandler(item)
                }).then((res)=>{
                    task.done = true;
                    task.status = Status.done;
                    item.error = false;
                    if(callback){
                        let {data}=res.data;
                        callback(data);
                    }
                    cur++;
                    if(cur == len){
                        resolve(result);
                    }
                    return res;
                }).catch((err)=>{
                    let {data} = err.response;
                    task.status = Status.error;
                    retryArr[index]++;
                    if(retryArr[index] >= retryLimit){
                        console.log(index, retryArr[index],'次报错',data);
                        item.error = true;
                        item.percentage = 50;
                        cur++;
                        const enhancedError = {
                            message: `Upload failed after ${retryLimit} retries`,
                            index: task.index,
                            originalError: data
                        };

                        return Promise.reject(enhancedError);
                    }
                }).finally(()=>{
                    max++;
                    if(cur < len){
                        start();   
                    }
                }));
            }
        }

        start();
    })
}