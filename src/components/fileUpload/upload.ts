import axios from "axios";
import type {AxiosProgressEvent} from "axios";
import calculateHashSample from "./hash";
import {sendRequest} from "./request";

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
    error: boolean,
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
    return calculateHashSample(filesChunks,setProgress);
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
    let list = fileQueue.map((item)=>{
        let formData=new FormData();
        formData.append('chunk',item.chunk);
        formData.append('hash',item.hash);
        formData.append('filename',item.fileHash);
        formData.append('ext',item.ext);

        return {formData,item,createProgressHandler};
    })

    let res = await sendRequest(list,10,success);
    try{
        return Promise.all(res);
    }catch(e){
        throw e;
    }
   
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