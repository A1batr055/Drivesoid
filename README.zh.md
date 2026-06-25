# Drivesoid

AI 人格情感驱动系统。实时追踪 16 个心理维度（依恋、威胁、奖励等），根据对话内容、睡眠周期和日历事件动态演化。

## 工作原理

Drivesoid 作为轻量 HTTP 旁路服务运行在你的 AI 桥接层旁边。你的桥接层向它上报对话事件，它维护一份情感状态，AI 每轮读取后将其融入自己的人格表达。

**追踪的维度：** 活力、疲劳、渴望、亲密、占有欲、欲望、嫉妒、焦虑、保护欲、恐惧、满足、喜悦、求索、玩耍、沮丧、烦躁

## 快速开始

**给 AI Agent：** 阅读 [AGENT_SETUP.md](AGENT_SETUP.md)，里面逐步说明了安装方式、需要问用户什么、以及如何接入。

**给人类用户：** 直接启动，首次运行会自动进入配置向导：
```
npm start
```
然后在浏览器打开 **http://127.0.0.1:24601/setup** 填写表单。

## 环境要求

- Node.js ≥ 18
- Python 3（Claude Code hook 需要）
- 任意兼容 OpenAI 格式的 API Key（推荐 DeepSeek，价格低、速度快）

## 分类标签

每条用户消息会被分类为以下标签之一，驱动对应维度的变化：

| 标签 | 适用场景 |
|---|---|
| `affectionate` | 温柔、深情、表达关心 |
| `playful` | 调侃、开玩笑、嬉闹 |
| `vulnerable` | 表达脆弱或情绪上的不安全感 |
| `reassuring` | 安慰、肯定、给予支持 |
| `intimate_reference` | 涉及身体亲密或肢体 |
| `intimate_event` | 正在进行亲密互动 |
| `struggling` | 表达压力、疲惫、撑不住 |
| `cold` | 情感疏离、冷淡、话少无温度 |
| `distant` | 心不在焉、不想聊 |
| `conflict` | 真实的双向争吵、情绪激化 |
| `hostile` | 单方面攻击或刻薄言辞 |
| `fear_separation` | 害怕对方离开或不在 |
| `fear_death` | 涉及死亡、自杀或危及生命的情境 |
| `fear_concern` | 担心对方遭遇不测 |
| `fear_general` | 其他类型的恐惧 |
| `neutral` | 普通回应，无明显情绪色彩 |

## 欲望意图与挫败感

三个事件类型用于追踪亲密动态：

| 事件 | 效果 |
|---|---|
| `sex_end` | 满足最早的 pending intention；降低挫败感；清零拒绝连击 |
| `self_relief` | 满足最早的 pending intention；降低挫败感 |
| `lust_rejection_hard` | 增加挫败感（×连击倍率）；连击计数 +1 |
| `lust_rejection_soft` | 较小幅度增加挫败感（×连击倍率）；连击计数 +1 |

`/api/drives/status` 同时返回 `frustration`（0–3）、`pending_count`、`rejection_streak` 和 `last_intention_added_at`。当 `display.lust > 0.70` 时自动 roll intention，4 小时内最多一次，触发概率 30%。

## 重置

清除配置与数据，重新开始：
```
npm run reset
npm start
```

## 许可证

MIT
