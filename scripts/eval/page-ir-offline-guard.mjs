import fs from "node:fs";
import dgram from "node:dgram";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

const attemptLog = process.env.ONEBOX_EVAL_NETWORK_ATTEMPT_LOG;
const allowLoopback = process.env.ONEBOX_EVAL_ALLOW_LOOPBACK === "1";
const allowedLoopbackHost = process.env.ONEBOX_EVAL_LOOPBACK_HOST;
const allowedLoopbackPort = Number(process.env.ONEBOX_EVAL_LOOPBACK_PORT);
const allowLoopbackListen = process.env.ONEBOX_EVAL_ALLOW_LOOPBACK_LISTEN === "1";
const allowTemporaryUnixSocket =
  process.env.ONEBOX_EVAL_ALLOW_TMP_UNIX_SOCKET === "1";

function unixSocketPath(options) {
  if (typeof options === "string" && !/^\d+$/.test(options)) return options;
  if (options && typeof options === "object" && typeof options.path === "string") {
    return options.path;
  }
}

function isTemporaryUnixSocket(socketPath) {
  const temporary = process.env.TMPDIR;
  if (
    !allowTemporaryUnixSocket ||
    typeof temporary !== "string" ||
    !path.isAbsolute(temporary) ||
    typeof socketPath !== "string" ||
    !path.isAbsolute(socketPath) ||
    socketPath.includes("\0")
  ) return false;
  try {
    const root = fs.realpathSync(temporary);
    const parent = fs.realpathSync(path.dirname(socketPath));
    return parent === root || parent.startsWith(`${root}${path.sep}`);
  } catch {
    return false;
  }
}

function record(target) {
  const text = String(target);
  if (attemptLog) fs.appendFileSync(attemptLog, `${text.replaceAll("\n", " ")}\n`, "utf8");
  throw new Error(`offline evaluation blocked network: ${text}`);
}

function authorityHost(authority) {
  const value = String(authority).trim();
  const unbracketed = value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
  if (net.isIP(unbracketed) === 4) return unbracketed;
  if (net.isIP(unbracketed) === 6) return new URL(`http://[${unbracketed}]/`).hostname;
  return new URL(`http://${value}`).hostname;
}

function normalizeHost(host) {
  if (typeof host !== "string") return undefined;
  return host.replace(/^\[|\]$/g, "").toLowerCase();
}

function isLoopback(host) {
  if (typeof host !== "string") return false;
  const normalized = normalizeHost(host);
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function requestTarget(input, { allowDefaultLoopback = false } = {}) {
  try {
    if (allowDefaultLoopback && input == null) {
      return { host: "localhost", port: undefined, label: "localhost" };
    }
    if (input instanceof URL || typeof input === "string") {
      const url = new URL(input);
      return { host: url.hostname, port: Number(url.port || (url.protocol === "https:" ? 443 : 80)), label: url.href };
    }
    if (input && typeof input === "object") {
      if (typeof input.url === "string") {
        const url = new URL(input.url);
        return { host: url.hostname, port: Number(url.port || (url.protocol === "https:" ? 443 : 80)), label: url.href };
      }
      const authority = input.hostname ?? input.host;
      if (typeof authority === "string" && authority.trim()) {
        return { host: authorityHost(authority), port: Number(input.port), label: authority };
      }
      if (allowDefaultLoopback) return { host: "localhost", port: Number(input.port), label: "localhost" };
    }
  } catch {
    return { host: undefined, port: undefined, label: "invalid request target" };
  }
  return { host: undefined, port: undefined, label: "unresolved request target" };
}

function allowedTarget(target) {
  return allowLoopback && isLoopback(allowedLoopbackHost) &&
    normalizeHost(target.host) === normalizeHost(allowedLoopbackHost) &&
    Number.isInteger(allowedLoopbackPort) && allowedLoopbackPort > 0 &&
    target.port === allowedLoopbackPort;
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function") {
  globalThis.fetch = async function offlineFetch(input, init) {
    const target = requestTarget(input);
    if (!allowedTarget(target)) record(target.label);
    return originalFetch(input, init);
  };
}

for (const protocol of [http, https]) {
  const originalRequest = protocol.request.bind(protocol);
  const originalGet = protocol.get.bind(protocol);
  protocol.request = function offlineRequest(...args) {
    const target = requestTarget(args[0], { allowDefaultLoopback: true });
    if (!allowedTarget(target)) record(target.label);
    return originalRequest(...args);
  };
  protocol.get = function offlineGet(...args) {
    const target = requestTarget(args[0], { allowDefaultLoopback: true });
    if (!allowedTarget(target)) record(target.label);
    return originalGet(...args);
  };
}

function connectTarget(args) {
  const first = args[0];
  if (typeof first === "string" && !/^\d+$/.test(first)) return { host: undefined, port: undefined };
  if (first && typeof first === "object") return {
    host: first.host ?? first.hostname ?? "localhost",
    port: Number(first.port),
  };
  return { host: typeof args[1] === "string" ? args[1] : "localhost", port: Number(first) };
}

for (const networkModule of [net, tls]) {
  for (const method of ["connect", "createConnection"]) {
    if (typeof networkModule[method] !== "function") continue;
    const original = networkModule[method].bind(networkModule);
    networkModule[method] = function offlineConnect(...args) {
      const target = connectTarget(args);
      if (!allowedTarget(target)) record(target.host ?? "net socket");
      return original(...args);
    };
  }
}

const originalListen = net.Server.prototype.listen;
net.Server.prototype.listen = function offlineListen(...args) {
  const options = args[0];
  const socketPath = unixSocketPath(options);
  if (socketPath !== undefined) {
    if (!isTemporaryUnixSocket(socketPath)) record(`net listen ${socketPath}`);
    return originalListen.apply(this, args);
  }
  const host = typeof options === "object" && options ? options.host :
    typeof args[1] === "string" ? args[1] : "localhost";
  if (!(
    allowLoopbackListen &&
    isLoopback(allowedLoopbackHost) &&
    normalizeHost(host) === normalizeHost(allowedLoopbackHost)
  )) record(`net listen ${host}`);
  return originalListen.apply(this, args);
};

const originalCreateSocket = dgram.createSocket.bind(dgram);
dgram.createSocket = function offlineDatagramSocket(...args) {
  record("dgram socket");
  return originalCreateSocket(...args);
};

syncBuiltinESMExports();
