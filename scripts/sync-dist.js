#!/usr/bin/env node
// 把需要上线的静态文件同步进 dist/，供 CloudBase 静态托管上传（六级单词复习）
//
// 用法：node scripts/sync-dist.js
// 之后：tcb hosting deploy dist /cet6/ -e <envId> --verify
//
// 为什么先同步进 dist/ 再传：项目根目录里还有 PRD.md / README.md / cloudfunctions/ / 打卡/ 等
// 不该上线的东西，只挑静态资源进 dist/，避免把无关文件传上公网。

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// 需要上线的文件/目录（相对项目根）。页面用的是相对路径，子目录部署到 /cet6/ 也能正常解析。
const ITEMS = ["index.html", "styles.css", "app.js", "data"];

function copy(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copy(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log("已同步 " + path.relative(ROOT, dest).split(path.sep).join("/"));
  }
}

// 每次全量重建 dist/，避免删掉源里的文件后线上还留着旧的
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const item of ITEMS) {
  const src = path.join(ROOT, item);
  if (fs.existsSync(src)) {
    copy(src, path.join(DIST, item));
  } else {
    console.warn("跳过（不存在）：" + item);
  }
}

console.log("完成：dist/ 已就绪，可执行 tcb hosting deploy dist /cet6/ -e <envId> --verify");
