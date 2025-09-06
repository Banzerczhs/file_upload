import SparkMD5 from "spark-md5";
import type { rawChunk } from "./upload";

function calculateHashSample(chunks:Array<rawChunk>, setProgress:(progress:number)=>void):Promise<string>{
    return new Promise((res,rej)=>{
        let count = 0;
    
        function appendToSpark(file: Blob):Promise<string>{
            return new Promise((resolve,reject)=>{
                let spark = new SparkMD5.ArrayBuffer();
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

        let sparkChunks = [chunks[count].chunk];
        let cur = chunks[count++].size;
        async function work(deadline: IdleDeadline){
            while(count < chunks.length && deadline.timeRemaining() > 0){
                let file = chunks[count].chunk;
                let size = chunks[count].size;
                if(count == chunks.length-1){
                    sparkChunks.push(chunks[count].chunk);
                }else{
                    let mid = cur + size / 2;
                    let end = cur + size;
                    sparkChunks.push(file.slice(cur, cur + 2));
                    sparkChunks.push(file.slice(mid, mid + 2));
                    sparkChunks.push(file.slice(end - 2, end));
                }
                cur+=size;
                count++;
                
                if(count < chunks.length){
                    setProgress(Number((count / chunks.length * 100).toFixed(2)));
                }
            }

            let hash = await appendToSpark(new Blob(sparkChunks));
            setProgress(100);
            res(hash);
            
        }

        window.requestIdleCallback(work);
    })
}

export default calculateHashSample;