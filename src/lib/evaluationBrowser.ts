import { chromium, type Browser } from "playwright";

const EVALUATION_SANDBOX_MARKER =
  "darwin-sandbox-exec-network-and-user-storage-denied";

export async function launchEvaluationAwareBrowser(): Promise<Browser> {
  const evaluationEndpoint = process.env.ONEBOX_EVAL_BROWSER_WS_ENDPOINT;
  const evaluationHost = process.env.ONEBOX_EVAL_LOOPBACK_HOST;
  const evaluationPortValue = process.env.ONEBOX_EVAL_LOOPBACK_PORT;
  const evaluationSandbox = process.env.ONEBOX_EVAL_OS_SANDBOX;
  if (
    evaluationEndpoint === undefined &&
    evaluationHost === undefined &&
    evaluationPortValue === undefined &&
    evaluationSandbox === undefined
  ) {
    return chromium.launch();
  }
  if (
    evaluationEndpoint === undefined ||
    evaluationHost === undefined ||
    evaluationPortValue === undefined ||
    evaluationSandbox === undefined
  ) {
    throw new Error("invalid credential-free evaluation browser capability");
  }

  const evaluationPort = Number(evaluationPortValue);
  let endpoint: URL;
  try {
    endpoint = new URL(evaluationEndpoint);
  } catch {
    throw new Error("invalid credential-free evaluation browser capability");
  }
  if (
    evaluationSandbox !== EVALUATION_SANDBOX_MARKER ||
    endpoint.protocol !== "ws:" ||
    evaluationHost !== "127.0.0.1" ||
    endpoint.hostname !== evaluationHost ||
    !Number.isInteger(evaluationPort) ||
    evaluationPort < 1 ||
    Number(endpoint.port) !== evaluationPort
  ) {
    throw new Error("invalid credential-free evaluation browser capability");
  }
  return chromium.connect(evaluationEndpoint);
}
