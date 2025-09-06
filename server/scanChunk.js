const schedule = require('node-schedule');
const fs = require('fs/promises');
const path = require('path');
const { UPLOAD_DIR } = require('./paths');


function remove(file,stat){
    let now = new Date().getTime();
    let offset = now - stat.ctimeMs;
    let ext = path.extname(file);
    if(offset > 1000 * 300 && !ext){
        console.log('-----清除该文件碎片------',path.basename(file));
        try{
            fs.unlink(file);
        }catch(e){
            console.log('-------文件删除失败------',file,stat);
        }
    }
}


async function scan(dir,callback){
    let files = await fs.readdir(dir);
    files.forEach((fileName)=>{
        let fileDir = path.resolve(dir,fileName);
        fs.stat(fileDir).then((stat)=>{
            if(stat.isDirectory()){
                return scan(fileDir,remove);
            }

            if(callback){
                callback(fileDir,stat);
            }
        });
    })
}

async function removeEmptyDir(dir){
    let files = await fs.readdir(dir);
    files.forEach(file=>{
        let fileDir = path.resolve(dir,file);
        fs.stat(fileDir).then(async (stat)=>{
            if(stat.isDirectory()){
                let result = await fs.readdir(fileDir);
                if(!result.length){
                    console.log('-------删除空目录-------');
                    fs.rmdir(fileDir);
                }
            }
        })
    })
}

function start(){
    console.log('********开始执行定时清除文件碎片功能*********\n');
    schedule.scheduleJob('*/30 * * * * *',function(){
        scan(UPLOAD_DIR);
    })

    schedule.scheduleJob('0 */2 * * * *',function(){
        removeEmptyDir(UPLOAD_DIR);
    })
}

process.on('SIGTERM',function(){
    schedule.gracefulShutdown().then(()=>{
        process.exit(0);
    })
})

exports.start = start;