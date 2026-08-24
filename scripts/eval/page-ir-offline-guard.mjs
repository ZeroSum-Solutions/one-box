import fs from "node:fs";
import dgram from "node:dgram";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";

const attemptLog = process.env.ONEBOX_EVAL_NETWORK_ATTEMPT_LOG;
const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost", "[::1]"]);

function record(target) {
  const text = String(target);
  if (attemptLog) fs.appendFileSync(attemptLog, `${text.replaceAll("\n", " ")}\n`, "utf8");
  throw new Error(`offline evaluation blocked external network: ${text}`);
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

function requestTarget(input, { allowDefaultLoopback = false } = {}) {
  try {
    if (allowDefaultLoopback && input == null) {
      return { host: "localhost", label: "localhost" };
    }
    if (input instanceof URL || typeof input === "string") {
      const url = new URL(input);
      return { host: url.hostname, label: url.href };
    }
    if (input && typeof input === "object") {
      if (typeof input.url === "string") {
        const url = new URL(input.url);
        return { host: url.hostname, label: url.href };
      }
      const authority = input.hostname ?? input.host;
      if (typeof authority === "string" && authority.trim()) {
        return { host: authorityHost(authority), label: authority };
      }
      if (allowDefaultLoopback) return { host: "localhost", label: "localhost" };
    }
  } catch {
    return { host: undefined, label: "invalid request target" };
  }
  return { host: undefined, label: "unresolved request target" };
}

function assertLoopback(input, options) {
  const target = requestTarget(input, options);
  const host = target.host && String(target.host).toLowerCase();
  if (!host || !loopbackHosts.has(host)) record(target.label);
}

function isLoopbackAuthority(authority) {
  try {
    return loopbackHosts.has(authorityHost(authority).toLowerCase());
  } catch {
    return false;
  }
}

const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function") {
  globalThis.fetch = async function offlineFetch(input, init) {
    assertLoopback(input);
    return originalFetch(input, init);
  };
}

for (const protocol of [http, https]) {
  const originalRequest = protocol.request.bind(protocol);
  const originalGet = protocol.get.bind(protocol);
  protocol.request = function offlineRequest(...args) {
    assertLoopback(args[0], { allowDefaultLoopback: true });
    return originalRequest(...args);
  };
  protocol.get = function offlineGet(...args) {
    assertLoopback(args[0], { allowDefaultLoopback: true });
    return originalGet(...args);
  };
}

function connectHost(args) {
  const first = args[0];
  if (typeof first === "string" && !/^\d+$/.test(first)) return undefined;
  if (first && typeof first === "object") return first.host ?? first.hostname ?? "localhost";
  return typeof args[1] === "string" ? args[1] : "localhost";
}

for (const networkModule of [net, tls]) {
  for (const method of ["connect", "createConnection"]) {
    if (typeof networkModule[method] !== "function") continue;
    const original = networkModule[method].bind(networkModule);
    networkModule[method] = function offlineConnect(...args) {
      const host = connectHost(args);
      if (host !== undefined && !isLoopbackAuthority(host)) record(host);
      return original(...args);
    };
  }
}

const originalCreateSocket = dgram.createSocket.bind(dgram);
dgram.createSocket = function offlineDatagramSocket(...args) {
  record("dgram socket");
  return originalCreateSocket(...args);
};

syncBuiltinESMExports();
