/// <reference types="vite/client" />
/// <reference lib="webworker" />

import * as SparkMD5 from "spark-md5";

interface MyServiceWorkerGlobalScope extends ServiceWorkerGlobalScope{
    SparkMD5 : SparkMD5.ArrayBuffer
}

declare const self:MyServiceWorkerGlobalScope;