# Hero Randomizer 部署文档

这份文档面向把当前仓库部署到一台 Linux 云服务器上的场景。

本项目的运行方式比较简单：

- 后端是 Node.js + Koa
- 前端静态资源由 Koa 直接托管
- 数据库是本地 SQLite 文件
- 启动命令使用仓库根目录的 `npm start`

也就是说，线上通常只需要部署一个 Node 服务，再用 Nginx 做反向代理即可。

## 1. 推荐服务器环境

建议使用：

- 操作系统：Ubuntu 22.04 LTS 或 Ubuntu 24.04 LTS
- CPU：1 vCPU 或以上
- 内存：2 GB 或以上
- 磁盘：10 GB 或以上
- 网络：有公网 IP；如果需要 HTTPS，最好准备一个域名

如果只是自己和少量朋友使用，这个配置已经够用。

## 2. 服务器需要安装什么

建议安装下面这些组件：

- `git`：拉取和更新代码
- `nodejs`：运行项目
- `npm`：安装依赖
- `nginx`：反向代理和对外提供 80/443 端口
- `systemd`：托管 Node 进程，开机自启
- `certbot`：如果你有域名，用它申请 HTTPS 证书

## 3. Node 版本建议

这个项目使用了 Node 内置的 `node:sqlite` 模块，因此不要使用过老的 Node 版本。

建议直接使用：

- Node.js 24 LTS，或
- Node.js 25

如果你想尽量减少兼容性问题，优先选较新的 LTS。

## 4. 项目里的部署要点

部署这个仓库时，需要注意下面几点：

- 要在仓库根目录执行 `npm install` 或 `npm ci`
- 服务默认端口是 `3000`
- 前端页面和接口由同一个 Koa 进程提供
- 数据库文件位于 `apps/server/data/app.db`
- 注册邀请码依赖环境变量 `REGISTRATION_INVITE_CODE`

另外，当前项目在首次启动时会自动创建默认管理员账号：

- 用户名：`lwz`
- 初始密码：`20251030`

公网部署后，必须第一时间登录并修改密码。更稳妥的做法是后续把这部分改成环境变量配置。

## 5. 部署前准备

部署前你需要准备：

- 一台 Linux 云服务器
- 服务器的 SSH 登录权限
- 仓库代码地址
- 一个你自己设定的邀请码
- 可选：一个域名

还需要确认云服务器安全组已经放行：

- `22`：SSH
- `80`：HTTP
- `443`：HTTPS

如果你暂时不配置 HTTPS，至少先开放 `80`。

注意：

- 云厂商的安全组和服务器内的 `ufw`/`iptables` 不是一回事
- 即使你已经在服务器里放行了 `80`，如果阿里云安全组没有放行 `80`，公网依然无法访问
- 阿里云 ECS 至少要在实例绑定的安全组“入方向”里添加 `TCP 80/80`，来源 `0.0.0.0/0`
- 如果后面要启用 HTTPS，还要再放行 `TCP 443/443`

## 6. 首次部署步骤

以下步骤以 Ubuntu 为例。

### 6.1 安装系统依赖

```bash
sudo apt update
sudo apt install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

### 6.2 拉取代码

```bash
cd /opt
sudo git clone <你的仓库地址> hero-randomizer
sudo chown -R $USER:$USER /opt/hero-randomizer
cd /opt/hero-randomizer
```

### 6.3 安装项目依赖

必须在仓库根目录安装，因为这是一个 workspace 项目。

```bash
npm ci
```

如果你不使用 `npm ci`，也可以：

```bash
npm install
```

### 6.4 配置环境变量

创建一个环境变量文件：

```bash
sudo tee /etc/hero-randomizer.env > /dev/null <<'EOF'
PORT=3000
NODE_ENV=production
REGISTRATION_INVITE_CODE=请替换成你自己的强邀请码
EOF
```

说明：

- `PORT`：Node 服务监听端口
- `NODE_ENV`：生产环境标记
- `REGISTRATION_INVITE_CODE`：用户注册邀请码

如果你准备让 Node 服务监听 `9000`，就改成：

```bash
sudo tee /etc/hero-randomizer.env > /dev/null <<'EOF'
PORT=9000
NODE_ENV=production
REGISTRATION_INVITE_CODE=请替换成你自己的强邀请码
EOF
```

## 7. 先手动启动验证

在正式托管前，先手动确认服务能跑起来：

```bash
cd /opt/hero-randomizer
export $(cat /etc/hero-randomizer.env | xargs)
npm start
```

如果看到类似下面的日志，说明服务已经起来了：

```text
Koa API listening on http://localhost:3000
```

然后在服务器上测试：

```bash
curl http://127.0.0.1:3000/health
```

如果返回包含 `ok` 的 JSON，说明应用正常。

确认无误后，按 `Ctrl + C` 停掉手动启动的进程。

## 8. 用 systemd 托管服务

创建服务文件：

```bash
sudo tee /etc/systemd/system/hero-randomizer.service > /dev/null <<'EOF'
[Unit]
Description=Hero Randomizer
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/hero-randomizer
EnvironmentFile=/etc/hero-randomizer.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
```

加载并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hero-randomizer
sudo systemctl status hero-randomizer
```

查看日志：

```bash
sudo journalctl -u hero-randomizer -f
```

常用命令：

```bash
sudo systemctl restart hero-randomizer
sudo systemctl stop hero-randomizer
sudo systemctl start hero-randomizer
```

## 9. 用 Nginx 对外提供访问

创建站点配置：

```bash
sudo tee /etc/nginx/sites-available/hero-randomizer > /dev/null <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 你的域名或服务器公网IP _;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/hero-randomizer /etc/nginx/sites-enabled/hero-randomizer
sudo nginx -t
sudo systemctl reload nginx
```

如果你之前启用了 Nginx 默认站点，建议关闭它，避免依然命中默认欢迎页：

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

如果你的 Node 服务监听的不是 `3000`，一定要同步修改 `proxy_pass`。例如 Node 监听 `9000` 时，应改成：

```nginx
proxy_pass http://127.0.0.1:9000;
```

完成后，你就可以通过下面地址访问：

- `http://你的域名`
- `http://你的服务器公网IP`

## 10. 配置 HTTPS

如果你已经把域名解析到了服务器，建议继续配置 HTTPS：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

完成后，Nginx 会自动更新为 HTTPS 配置。

## 11. 数据文件与备份

这个项目使用 SQLite，本地数据文件在：

- `apps/server/data/app.db`
- `apps/server/data/app.db-wal`
- `apps/server/data/app.db-shm`

建议备份整个 `apps/server/data` 目录。

最稳妥的备份方式：

1. 先停服务
2. 复制整个数据目录
3. 再启动服务

示例：

```bash
sudo systemctl stop hero-randomizer
cp -r /opt/hero-randomizer/apps/server/data /opt/hero-randomizer-backup-$(date +%F)
sudo systemctl start hero-randomizer
```

## 12. 更新发布流程

后续更新代码时，按下面流程操作：

```bash
cd /opt/hero-randomizer
git pull
npm ci
sudo systemctl restart hero-randomizer
```

更新后建议立即检查：

```bash
sudo systemctl status hero-randomizer
curl http://127.0.0.1:3000/health
```

如果你不想每次手动敲这些命令，可以直接使用仓库里的更新脚本：

```bash
cd /opt/hero-randomizer
bash scripts/update-production.sh
```

这个脚本会按顺序完成：

- 拉取最新代码（如果当前目录有 `.git`）
- 执行 `npm ci`
- 停止 `hero-randomizer` 服务
- 备份 `apps/server/data`
- 重启服务
- 检查 `/health`

默认读取：

- 服务名：`hero-randomizer`
- 环境变量文件：`/etc/hero-randomizer.env`
- 端口：优先读取环境变量 `PORT`，否则使用 `3000`

如果你当前线上服务监听的是 `9000`，并且环境变量文件里已经写了 `PORT=9000`，脚本会自动按 `9000` 做健康检查，不需要额外修改。

如果你这次不是通过 `git pull` 更新，而是手动上传的新代码，可以跳过拉代码步骤：

```bash
cd /opt/hero-randomizer
SKIP_PULL=1 bash scripts/update-production.sh
```

如果你想改服务名或环境变量文件位置，也可以这样执行：

```bash
cd /opt/hero-randomizer
SERVICE_NAME=hero-randomizer ENV_FILE=/etc/hero-randomizer.env bash scripts/update-production.sh
```

## 13. 常见问题

### 13.1 页面打不开

检查：

- 安全组是否开放 `80` 或 `443`
- Nginx 是否启动
- Node 服务是否启动
- `server_name` 是否填写正确
- Nginx 是否仍然命中了默认站点
- `proxy_pass` 是否指向了 Node 实际监听端口

如果服务器本机访问正常，但你的电脑访问公网 IP 超时，优先怀疑云平台安全组，而不是应用本身。

一组很实用的排查命令：

```bash
curl -i http://127.0.0.1/health
curl -i http://127.0.0.1
curl -i http://127.0.0.1:3000/health
sudo tail -n 50 /var/log/nginx/access.log
sudo tail -n 50 /var/log/nginx/error.log
```

如果你用的是其他端口，比如 `9000`，要把上面的 `3000` 改成对应端口。

可用命令：

```bash
sudo systemctl status nginx
sudo systemctl status hero-randomizer
sudo journalctl -u hero-randomizer -n 100
```

### 13.2 服务启动失败

优先检查：

- Node 版本是否过低
- 是否在仓库根目录执行了 `npm ci`
- `/etc/hero-randomizer.env` 是否存在
- 端口 `3000` 是否被占用

检查端口：

```bash
sudo ss -lntp | grep 3000
```

### 13.3 注册不了新用户

检查环境变量 `REGISTRATION_INVITE_CODE` 是否配置正确。

修改后重启服务：

```bash
sudo systemctl restart hero-randomizer
```

### 13.4 默认管理员密码安全吗

不安全。

当前仓库会自动创建固定管理员账号和初始密码，所以公网部署后应立即修改密码。若后续长期使用，建议把默认管理员账号初始化逻辑改为环境变量或首次安装向导。

## 14. 推荐的上线后检查清单

建议上线后逐项确认：

- 能打开首页
- 能正常登录
- 能正常注册新用户
- 能访问 `/health`
- 能新增玩家
- 能正常抽队
- 默认管理员密码已经修改
- 已做好 `apps/server/data` 的备份

## 15. 更进一步的优化建议

如果你后面准备长期在线上使用，建议继续做这几项：

- 把默认管理员密码改成环境变量，不要写死在代码里
- 给 Koa 增加请求日志
- 为 Nginx 增加限流或基础访问控制
- 增加自动备份脚本
- 使用 Docker 或 Docker Compose 固化部署环境
