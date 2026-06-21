# Drivesoid

AI 人格情感驱动系统。实时追踪 15 个心理维度（依恋、威胁、奖励等），根据对话内容、睡眠周期和日历事件动态演化。

## 工作原理

Drivesoid 作为轻量 HTTP 旁路服务运行在你的 AI 桥接层旁边。你的桥接层向它上报对话事件，它维护一份情感状态，AI 每轮读取后将其融入自己的人格表达。

**追踪的维度：** 活力、疲劳、渴望、亲密、占有欲、欲望、嫉妒、焦虑、保护欲、满足、喜悦、求索、玩耍、沮丧、烦躁

## 快速开始

**给 AI Agent：** 阅读 [AGENT_SETUP.md](AGENT_SETUP.md)，里面逐步说明了安装方式、需要问用户什么、以及如何接入。

**给人类用户：** 运行配置向导：
```
npm run setup
```
然后启动：
```
npm start
```

## 环境要求

- Node.js ≥ 18
- Python 3（Claude Code hook 和 `npm run health` 需要）
- 任意兼容 OpenAI 格式的 API Key（推荐 DeepSeek，价格低、速度快）

## 许可证

MIT
