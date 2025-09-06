const http2 = require('http2');
const fs = require('fs');
const path = require('path');
const urlParse = require('url');
const multiparty = require('multiparty');
const { UPLOAD_DIR } = require('./paths');

const { start } = require('./scanChunk');

function parseFile(form, req) {
    return new Promise(function (resolve, reject) {
        form.parse(req, function (err, field, files) {
            if (err) {
                reject(err);
            }
            
            field=field || {};
            files=files || {};

            let [chunk] = files?.chunk || [''];
            let [hash] = field?.hash || [''];
            let [filename] = field?.filename || [''];
            let [ext] = field?.ext || [''];

            resolve({ chunk, hash, filename, ext });
        });
    });
}

function pipeStream(path, writeStream){
    return new Promise((resolve,reject) => {
        try{
            const readStream = fs.createReadStream(path);
            readStream.on('end', () => {
                fs.unlinkSync(path);
                resolve();
            });
            readStream.pipe(writeStream);
        }catch(e){
            reject(e);
        }
    });
}

function mergeFile(fileInfo){
    let {file,readPath,writePath}=fileInfo;
    let filePs=file.list.sort(function (a, b) {
        let aIndex = a.split(file.flag)[1] || 0;
        let bIndex = b.split(file.flag)[1] || 0;
        return Number(aIndex) - Number(bIndex);
    }).map((item,index) => {
        return pipeStream(path.resolve(readPath, item),fs.createWriteStream(writePath,{
            start : index * file.size
        }))
    });

    return Promise.all(filePs);
}

function createChunkFile(file) {
    let { chunk } = file;
    return new Promise(function (resolve, reject) {
        fs.copyFile(chunk.path, file.name, (error) => {
            if (error) reject(error);
            fs.unlink(chunk.path, (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    });
}

function createUploadedList(filePath){
    return new Promise(function(resolve,reject){
        if(fs.existsSync(filePath)){
            fs.readdir(filePath,function(err,files){
                if(!err){
                    resolve(files);
                }else{
                    reject(err);
                }
            })
        }else{
            resolve([]);
        }
    })
}


const server = http2.createSecureServer(
    {
        key: fs.readFileSync(path.resolve(__dirname, './ca/key.pem')),
        cert: fs.readFileSync(path.resolve(__dirname, './ca/cert.pem')),
        allowHTTP1: true
    },
    function (req, res) {
        let urlSchema = urlParse.parse(req.url, true);
        if (req.method == 'POST') {
            if (urlSchema.pathname == '/uploadFile') {
                let form = new multiparty.Form();
                parseFile(form, req)
                    .then((fileInfo) => {
                        let chunkDir = path.resolve(
                            UPLOAD_DIR,
                            fileInfo.filename
                        );
                        if(!fs.existsSync(UPLOAD_DIR)){
                            fs.mkdirSync(UPLOAD_DIR);
                        }
                        if (!fs.existsSync(chunkDir)) {
                            fs.mkdirSync(chunkDir);
                        }
                        // if(Math.random() * 10 + 1 < 5){
                        //     throw new Error('上传出错');
                        // }
                        createChunkFile({
                            chunk: fileInfo.chunk,
                            name: path.resolve(chunkDir, fileInfo.hash)
                        }).then(()=>{
                            res.writeHead(200, {
                                'Content-Type': 'application/json;charset=utf-8'
                            });
                            res.end(
                                JSON.stringify({
                                    data: {
                                        filename: fileInfo.filename,
                                        hash: fileInfo.hash,
                                        ext: fileInfo.ext
                                    },
                                    status: {
                                        code: 0,
                                        msg: 'Upload Success!'
                                    }
                                })
                            );
                        }).catch((err)=>{
                            res.writeHead(200, {
                                'Content-Type': 'application/json;charset=utf-8'
                            });
                            res.end(
                                JSON.stringify({
                                    status: {
                                        code: 1001,
                                        msg: 'Upload Failed!'
                                    }
                                })
                            );
                        })
                        return fileInfo;         
                    })
                    .catch((err) => {
                        console.log('------upload file err-----',err);
                        res.writeHead(500, {
                            'Content-Type': 'application/json;charset=utf-8'
                        });
                        res.end(
                            JSON.stringify({
                                data: {
                                    status: {
                                        code: 1001,
                                        msg: 'Upload Failed!'
                                    }
                                }
                            })
                        );
                    });
            }

            if (urlSchema.pathname == '/mergeFile') {
                req.on('data', function (chunk) {
                    let info = JSON.parse(chunk.toString());
                    let { flag, filename, size, ext } = info;
                    let merge_dir = path.resolve(UPLOAD_DIR,filename);
                    fs.readdir(merge_dir, function (errMsg, files) {
                        mergeFile({
                            file : {list:files,flag,size},
                            readPath : merge_dir,
                            writePath : path.resolve(merge_dir,filename+ext)
                        }).then(()=>{
                            res.writeHead(200, {
                                'Content-Type': 'application/json;charset=utf-8'
                            });

                            res.end(
                                JSON.stringify({
                                    status: {
                                        code: 0,
                                        msg: '文件合并成功'
                                    }
                                })
                            );
                        }).catch((err)=>{
                            console.log('----err---',err);
                            res.writeHead(200, {
                                'Content-Type': 'application/json;charset=utf-8'
                            });
                            res.end(
                                JSON.stringify({
                                    status: {
                                        code: 1000,
                                        msg: '文件合并失败'
                                    }
                                })
                            );
                        });
                    });
                });
            }

            if (req.url === "/verify") {
                req.on('data',function(data){
                    let info = JSON.parse(data.toString());
                    const { fileHash } = info;
                    const resource=`${fileHash}`;
                    const filePath = path.resolve(UPLOAD_DIR, resource,resource);
                    if (fs.existsSync(filePath)) {
                        res.end(
                            JSON.stringify({
                                shouldUpload: false
                            })
                        );
                    } else {
                        createUploadedList(path.resolve(UPLOAD_DIR, resource)).then((fileList)=>{
                            res.end(
                                JSON.stringify({
                                    shouldUpload: true,
                                    uploadedList: fileList
                                })
                            );
                        }).catch((err)=>{
                            console.log('-----verify err-----',err);
                        })                      
                    }
                })
            }
        } else {
            res.writeHead(200);
            res.end('Hello from HTTPS server!\n');
        }
    }
);

const port = 7070;

server.listen(port, function () {
    start();
    console.log('----https listen to port----', port);
});
