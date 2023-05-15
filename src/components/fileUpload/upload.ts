import axios from "axios";
import type {AxiosProgressEvent} from "axios";

export type rawChunk={
    chunk: Blob,
    size: number
}

export type fileChunk={
    chunk : Blob,
    hash : string,
    percentage : number,
    fileHash: string,
    size: number,
    ext: string,
    controller?: AbortController
}

export type progressHandler=(progressEvent: AxiosProgressEvent) => void;

export type FileChunks=Array<fileChunk>;
/**
 * 
 * @param file 文件对象
 * @param size 一个数值，单位为字节，表示以多少字节做文件分割
 * @returns 
 */
export const createFileChunk=function(file:File,size:number):Array<rawChunk>{
    let total=file.size;
    let chunks=Math.ceil(total / size);

    let fileChunks:Array<rawChunk>=[];
    for(let i=0;i<chunks;i++){
        let buffer=file.slice(i*size,(i+1)*size,file.type);
        fileChunks.push({ chunk: buffer,size : buffer.size });
    }

    return fileChunks;
}


export const createFileHash=function(filesChunks:Array<rawChunk>,setProgress:(percentage:number)=>void):Promise<string>{
    let hashWorker=new Worker('./hash.js');
    hashWorker.postMessage({filesChunks});

    return new Promise((resolve,reject)=>{
        hashWorker.onmessage=function(event){
            let {hash,percentage}=event.data;
            setProgress(percentage);
            if(hash){
                resolve(hash);
            }
        }

        hashWorker.addEventListener('error',function(err){
            reject(err.message);
        })
    })
}


export const uploadFileHandler=async function(config:{
    fileQueue:FileChunks,
    createProgressHandler:(item:fileChunk)=>progressHandler,
    success?:(data:any)=>void
}){
    let {fileQueue,createProgressHandler,success}=config;
    if(!fileQueue.length){
        return Promise.resolve([{
            data : {
                status : {
                    code : 0
                }
            }
        }]);
    }
    let ps=fileQueue.map((item)=>{
        let formData=new FormData();
        formData.append('chunk',item.chunk);
        formData.append('hash',item.hash);
        formData.append('filename',item.fileHash);
        formData.append('ext',item.ext);

        return {formData,item};
    }).map(({formData,item})=>{
        let signal=item.controller?.signal;
        return axios.post('/api/uploadFile',formData,{
            signal,
            onUploadProgress : createProgressHandler(item)
        }).then((res)=>{
            if(success){
                let {data}=res.data;
                success(data);
            }

            return res;
        });
    });

    return await Promise.all(ps);
}

export const verifyUpload = (ext:string, fileHash:string) => {
    let payload=JSON.stringify({
        ext,
        fileHash
    })
    return axios.post('/api/verify',payload,{
        headers: {
            "content-type": "application/json"
        }
    });
}

export const mergeFileHandler=function(payload:any){
    return axios.post('/api/mergeFile',payload);
}