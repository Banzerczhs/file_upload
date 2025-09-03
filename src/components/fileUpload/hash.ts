import SparkMD5 from "spark-md5";
import type { rawChunk } from "./upload";

function calculateHashSample(chunks:Array<rawChunk>, setProgress:(progress:number)=>void):Promise<string>{
    return new Promise((res,rej)=>{
        let count = 0;
        let spark = new SparkMD5.ArrayBuffer();
    
        function appendToSpark(file: Blob):Promise<string>{
            return new Promise((resolve,reject)=>{
                let fileReader = new FileReader();
                fileReader.readAsArrayBuffer(file);
                fileReader.onload = function(e){
                    spark.append(e.target?.result as ArrayBuffer);
                    resolve(spark.end());
                }

                fileReader.onerror=function(e){
                    reject(e);
                }
            })
        }

        let cur = 0;
        async function workLoop(deadline: IdleDeadline){
            while(count < chunks.length && deadline.timeRemaining() > 1){
                let file = chunks[count].chunk;
                let size = chunks[count].size;
                if(count == chunks.length-1 || count == 0){
                    let hash = await appendToSpark(file);
                }else{
                    let mid = cur + size / 2;
                    let end = cur + size;
                    // let sparkPs = [
                    //     appendToSpark(file.slice(cur, cur + 2)),
                    //     appendToSpark(file.slice(mid, mid + 2)),
                    //     appendToSpark(file.slice(end - 2, end))
                    // ]
                    // await Promise.all(sparkPs);
                    let hash = await appendToSpark(file);
                }
                cur+=size;
                count++;
                
                if(count < chunks.length){
                    setProgress(Number((count / chunks.length * 100).toFixed(2)));
                }else{
                    res(spark.end());
                    setProgress(100);
                }
            }
            window.requestIdleCallback(workLoop);
        }

        window.requestIdleCallback(workLoop);
    })
}

export default calculateHashSample;