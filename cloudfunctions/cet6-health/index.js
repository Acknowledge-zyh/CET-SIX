// /cet6/api/health —— 健康检查云函数（六级单词复习 / cet6-vocab）
//
// 类型：CloudBase 事件型云函数（exports.main）。
// 经「HTTP 访问服务」把路径 /cet6/api/health 映射到这个函数，返回「集成响应」格式
// （自己决定状态码与响应头），详见 api-contract.md 第 2 节。
//
// 为什么路径带 /cet6 前缀：
//   本项目与「今日热搜」(VibeCoding) 共用同一个免费 CloudBase 环境，而环境是账号级的、
//   路径是环境级唯一的——今日热搜已占用 /api/health，所以本项目用 /cet6/api/health，
//   函数名也用 cet6-health，两者互不干扰。
//
// 边界（刻意保持最小）：
//   - 只实现 GET /cet6/api/health，不连数据库、不写任何业务逻辑
//   - 永远返回 HTTP 200 + 同一份 JSON：{ ok, service }
//
// 部署（实测可用）：
//   tcb fn deploy cet6-health -e <envId> --path /cet6/api/health --runtime Nodejs18.15 --force
//   ⚠️ 不要加 --httpFn：那是 Web 函数，建的访问路径会报
//     400 FUNCTIONS_PARAM_INVALID: FunctionType parameter is invalid

const SERVICE_NAME = "cet6-vocab";

exports.main = async () => {
  const payload = {
    ok: true,
    service: SERVICE_NAME,
  };

  // HTTP 访问服务「集成响应」格式
  return {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
};
