# filter_modules

过滤出指定目录下无用的文件, 项目参考 [find-unused-module](https://github.com/QuarkGluonPlasma/find-unused-module)

## 项目欠缺

项目需要考虑到: import(), require.context 等情况, 另外需要考虑 node 处理未使用的文件
