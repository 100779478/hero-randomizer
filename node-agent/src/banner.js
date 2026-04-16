const HFT_BANNER = String.raw`
██╗  ██╗███████╗████████╗
██║  ██║██╔════╝╚══██╔══╝
███████║█████╗     ██║
██╔══██║██╔══╝     ██║
██║  ██║██║        ██║
╚═╝  ╚═╝╚═╝        ╚═╝
`;

export function renderBanner(config) {
  return [
    HFT_BANNER.trimEnd(),
    "HFT 本地智能体",
    `模型接口  ${config.baseUrl}`,
    `模型      ${config.model}`,
    `业务接口  ${config.apiBaseUrl}`,
    `工作目录  ${config.workspace}`,
    "命令      /reset 重置会话   /exit 退出程序",
  ].join("\n");
}