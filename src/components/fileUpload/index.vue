<template>
    <div class="file_upload">
        <div><input type="text"></div>
        <div class="upload_action">
            <el-upload ref="uploadRef" class="avatar-uploader" :show-file-list="false" :on-change="fileChange" :auto-upload="false"
                :multiple="false">
                <template #trigger>
                    <el-icon class="avatar-uploader-icon">
                        <Plus />
                    </el-icon>
                </template>
                <el-button class="ml-3 upload-btn" type="success" @click="beforeUpload">
                    upload to server
                </el-button>
                <el-button class="ml-3 upload-btn" type="warning" @click="abortUpload">
                    pause upload
                </el-button>
                <el-button class="ml-3 upload-btn" type="primary" @click="restoreUpload">
                    restore upload
                </el-button>
            </el-upload>
            <div class="upload-file" v-if="rawFileName">
                <el-icon><Document /></el-icon>
                <span>{{ rawFileName }}</span>
            </div>
        </div>
        <div class="upload-progress">
            <h2>progress</h2>
            <div class="total-progress">
                <h3>calculateHash</h3>
                <el-progress :percentage="hashPercentage"></el-progress>
                <h3>totalPercentage</h3>
                <el-progress :percentage="totalPercentage"></el-progress>
            </div>
            <div class="progress-list">
                <template :key="item.hash" v-for="item in uploadFileChunks">
                    <div class="list-item">
                        <span class="item-name">{{ item.hash }}</span>
                        <span class="item-size">{{ item.size }}B</span>
                        <el-progress :status="item.error ? 'exception' : ''" class="progress-stripe" :percentage="item.percentage" />
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { ElUpload, ElIcon, ElButton, ElProgress, ElMessage } from "element-plus";
import type { UploadProps, UploadInstance, UploadFile } from "element-plus";
import { Plus,Document } from "@element-plus/icons-vue";
import { computed, reactive, ref } from 'vue'

import { createFileChunk, uploadFileHandler, mergeFileHandler, createFileHash, verifyUpload } from "./upload";
import type { fileChunk, progressHandler } from "./upload";

const uploadRef = ref<UploadInstance>();
let uploadFileChunks = reactive<Array<fileChunk>>([]);
let hashPercentage = ref(0);
let rawFileName=ref('');

let fileInfo={
    splitFlag : '&-&',
    ext : '',
    chunkSize : 1024 * 2048,
    hash : ''
}

//提取文件后缀
const extractExt = (filename:string) =>
    filename.slice(filename.lastIndexOf("."), filename.length);

let totalPercentage = computed(() => {
    if (!uploadFileChunks.length) return 0;
    const loaded = uploadFileChunks.map(item => {
        if(!item.error){
            return item.percentage;
        }else{
            return 0;
        }
    }).reduce((acc, cur) => acc + cur, 0);
    return parseInt((loaded / uploadFileChunks.length).toFixed(2));
})

const fileChange: UploadProps['onChange'] = async (uploadFile:UploadFile) => {
    if (uploadFile.raw !== undefined) {
        uploadFileChunks.length = 0;
        hashPercentage.value=0;
        let rawFile = uploadFile.raw;
        console.log('-------rawFile------', rawFile);
        rawFileName.value=rawFile.name;
        let chunks = createFileChunk(rawFile, fileInfo.chunkSize);
        try{
            uploadFileChunks.push(...chunks.map(({ chunk, size },index): fileChunk => {
                let abortController=new AbortController();
                return {
                    chunk,
                    fileHash: '',
                    hash: rawFile.name+fileInfo.splitFlag+index,
                    percentage: 0,
                    error: false,
                    size,
                    ext: '',
                    controller: abortController
                }
            }));
        }catch(e){
            console.log('---err---',e);
        }
    }
}

const factoryProgress = (item: fileChunk): progressHandler => {
    return (progressEvent) => {
        let aborted=item.controller?.signal.aborted;
        if (!aborted&&progressEvent.total) {
            item.percentage = Math.floor((progressEvent.loaded / progressEvent.total) * 100);
        }
    }
}

const uploadSuccess=(data:any)=>{
    uploadFileChunks.forEach(item=>{
        if(item.hash==data.hash){
            item.controller=undefined;
        }
    })
}

const restoreUpload = ()=>{
    verifyUpload(fileInfo.ext,fileInfo.hash).then(({data})=>{
        let {uploadedList=[],shouldUpload}=data;
        if(shouldUpload){
            let requestChunks=uploadFileChunks.filter(item=>{
                let existChunk=uploadedList.includes(item.hash);
                if(!existChunk){
                    item.controller=new AbortController();
                    return true;
                }else{
                    item.percentage=100;
                    return false;
                }
            });
            console.log('------uploadList-----', requestChunks);
            submitUpload(requestChunks);
        }else{
            ElMessage({
                message : 'file upload done',
                type : 'success'
            });
        }
    });    
}

const abortUpload = ()=>{
    if(fileInfo.hash){
        uploadFileChunks.forEach(item=>{
            if(item.controller){
                item.controller.abort();
            }
        })
    }
}

const beforeUpload=async ()=>{
    hashPercentage.value=0;
    if(!uploadFileChunks.length){
        return;
    }
    uploadFileChunks.forEach(chunk=>{
        chunk.percentage=0;
    })

    let chunks=uploadFileChunks.map(item=>({chunk : item.chunk,size:item.size}));
    fileInfo.hash = await createFileHash(chunks, function (percentage) {
        hashPercentage.value = percentage;
    });

    fileInfo.ext=extractExt(rawFileName.value);
    let verify = await verifyUpload(fileInfo.ext,fileInfo.hash);
    let {shouldUpload,uploadedList=[]}=verify.data;

    if(!shouldUpload){
        ElMessage({
            message : 'skip upload：file upload success',
            type : 'success'
        });
        
        uploadFileChunks.forEach(chunk=>{
            chunk.percentage=100;
        })
    }else{
        let requestList=uploadFileChunks.map((chunk,index)=>{
            chunk.fileHash=fileInfo.hash;
            chunk.hash=fileInfo.hash+fileInfo.splitFlag+index;
            chunk.ext=fileInfo.ext;

            return chunk;
        }).filter(item=>{
            let existChunk=uploadedList.includes(item.hash);
            if(existChunk){
                item.percentage=100;
            }

            return !existChunk;
        })
        
        submitUpload(requestList);
    }
}

function submitUpload(fileQueue:Array<fileChunk>){
    uploadFileHandler({
        fileQueue,
        createProgressHandler: factoryProgress,
        success: uploadSuccess
    }).then((resList) => {
        resList = resList.filter(v=>!!v);
        let res = resList[0];
        let { status } = res.data;
        if (status && status.code == 0) {
            mergeFileHandler({
                filename: fileInfo.hash, 
                flag: fileInfo.splitFlag,
                size: fileInfo.chunkSize,
                ext : fileInfo.ext
            });
        }
    }).catch((err) => {
        let {message,index,originalError} = err;
        console.log('------error-----', message,index,originalError);
    });
}
</script>

<style>
.file_upload {
    min-width: 1000px;
    margin: 0 auto;
}

.avatar-uploader {
    text-align: left;
    margin-right: 20px;
    overflow: hidden;
}

.upload-file{
    text-align: left;
    margin-top: 5px;
}

.upload-file span{
    color: #606266;
    font-size: 12px;
    vertical-align: text-top;
    padding-left: 5px;
    transition: all .2s;
}
.upload-file:hover{
    transition: all .2s;
    background-color: #f5f7fa;
    cursor: pointer;
}
.upload-file:hover span{
    color: #409eff;
}

.avatar-uploader .el-upload {
    border: 1px dashed var(--el-border-color);
    border-radius: 6px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: var(--el-transition-duration-fast);
    margin-right: 20px;
    float: left;
}

.avatar-uploader .el-upload-list {
    margin-top: 10px;
}

.avatar-uploader .el-upload:hover {
    border-color: var(--el-color-primary);
}

.el-icon.avatar-uploader-icon {
    font-size: 28px;
    color: #8c939d;
    width: 70px;
    height: 32px;
    text-align: center;
}

.upload-progress {
    margin-top: 10px;
    text-align: left;
}

.total-progress {
    width: 100%;
    margin-bottom: 10px;
}

.progress-list .progress-stripe {
    width: 500px;
    margin-bottom: 15px;
}

.progress-list .list-item {
    display: flex;
    justify-content: space-between;
}

.progress-list .list-item .item-name {
    width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.progress-list .list-item .item-size {
    min-width: 100px;
    text-align: left;
}
</style>