self.importScripts(
    'https://cdn.bootcdn.net/ajax/libs/spark-md5/3.0.2/spark-md5.min.js'
);

self.onmessage = (e) => {
    const { filesChunks } = e.data;
    const spark = new self.SparkMD5.ArrayBuffer();
    let percentage = 0;
    let count = 0;
    const loadNext = (index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            count++;
            spark.append(e.target.result);
            if (count === filesChunks.length) {
                self.postMessage({
                    percentage: 100,
                    hash: spark.end()
                });
                self.close();
            } else {
                percentage= Math.ceil((count / filesChunks.length) * 100);
                self.postMessage({
                    percentage
                });
                loadNext(count);
            }
        };
        reader.readAsArrayBuffer(filesChunks[index].chunk);
    };
    loadNext(0);
};
