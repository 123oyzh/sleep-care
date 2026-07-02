# 使用官方 Node.js 18 Alpine 镜像（体积小，启动快）
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制后端 package.json 并安装依赖
COPY backend/package*.json ./
RUN npm install --production

# 复制后端源代码
COPY backend/ .

# 暴露应用端口 (CloudBase 云托管默认使用 80 端口，但这里保持 3000)
EXPOSE 3000

# 启动应用
CMD ["node", "app.js"]
