#jdos 无需设置FROM,编译会替换用户设置FROM为jdos控制台上选择的镜像
# 使用镜像是 hub.is.jd.com/jdos_base/jd-new-ubuntu20.04:v20220106-3

# JDOS 运行时会检查该目录；缺失会导致启动失败
RUN mkdir -p /export/Data

RUN apt-get update && apt-get install -y  \
    curl xz-utils --no-install-recommends &&\
    rm -rf /var/lib/apt/lists/* &&\
    curl --version && tar --version &&\
    xz --version

# 安装nodejs v24.14.0 (LTS)
ARG NODE_URL=http://storage.jd.local/store-jddj-dev/cdn-resource/node-v24.14.0-linux-x64.tar.xz

RUN curl -fsSLO --compressed ${NODE_URL} &&\
    tar -xJf "node-v24.14.0-linux-x64.tar.xz" \
    -C /usr/local --strip-components=1 --no-same-owner &&\
    ln -s /usr/local/bin/node /usr/local/bin/nodejs &&\
    rm -f "node-v24.14.0-linux-x64.tar.xz" &&\
    node --version && npm --version && npx --version &&\
    npm set registry http://mirrors.jd.com/npm
    npm i pnpm@11.23.0 -g
    