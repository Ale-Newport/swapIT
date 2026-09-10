/**
 * Every registered HTTP status code, with the two facts a developer actually
 * has to look up: may the response carry a body, and is it cacheable without
 * explicit freshness headers (RFC 9110 §15 "heuristically cacheable").
 */

export type StatusClass = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';
export type Cacheability = 'default' | 'headers' | 'never';

export interface StatusCode {
  code: number;
  name: string;
  meaning: string;
  /** False when the response must not include a body. */
  body: boolean;
  cacheable: Cacheability;
  spec: string;
}

export const CLASS_LABELS: Record<StatusClass, string> = {
  '1xx': 'Informational',
  '2xx': 'Success',
  '3xx': 'Redirection',
  '4xx': 'Client error',
  '5xx': 'Server error',
};

export function statusClass(code: number): StatusClass {
  return `${Math.floor(code / 100)}xx` as StatusClass;
}

export const STATUS_CODES: StatusCode[] = [
  // ---------------------------------------------------------------- 1xx
  { code: 100, name: 'Continue', meaning: 'Keep going — the request headers were accepted, send the body.', body: false, cacheable: 'never', spec: 'RFC 9110' },
  { code: 101, name: 'Switching Protocols', meaning: 'The server is changing protocol as asked, typically to WebSocket.', body: false, cacheable: 'never', spec: 'RFC 9110' },
  { code: 102, name: 'Processing', meaning: 'WebDAV: the request was received and is still being worked on.', body: false, cacheable: 'never', spec: 'RFC 2518' },
  { code: 103, name: 'Early Hints', meaning: 'Preload hints sent before the real response, usually Link headers.', body: false, cacheable: 'never', spec: 'RFC 8297' },

  // ---------------------------------------------------------------- 2xx
  { code: 200, name: 'OK', meaning: 'The request succeeded and the result is in the body.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 201, name: 'Created', meaning: 'A new resource was created; its address is in the Location header.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 202, name: 'Accepted', meaning: 'Queued for processing — the work has not finished yet.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 203, name: 'Non-Authoritative Information', meaning: 'Success, but a proxy modified the payload on the way.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 204, name: 'No Content', meaning: 'Success with nothing to send back — the page should not change.', body: false, cacheable: 'default', spec: 'RFC 9110' },
  { code: 205, name: 'Reset Content', meaning: 'Success; the client should clear the form that sent the request.', body: false, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 206, name: 'Partial Content', meaning: 'Only the requested byte range is returned, for resumable downloads.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 207, name: 'Multi-Status', meaning: 'WebDAV: one status per resource, listed in an XML body.', body: true, cacheable: 'headers', spec: 'RFC 4918' },
  { code: 208, name: 'Already Reported', meaning: 'WebDAV: this member was already listed earlier in the response.', body: true, cacheable: 'headers', spec: 'RFC 5842' },
  { code: 226, name: 'IM Used', meaning: 'The response is the result of instance manipulations on the resource.', body: true, cacheable: 'headers', spec: 'RFC 3229' },

  // ---------------------------------------------------------------- 3xx
  { code: 300, name: 'Multiple Choices', meaning: 'Several representations exist; the client picks one.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 301, name: 'Moved Permanently', meaning: 'The resource has a new home — update your links and bookmarks.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 302, name: 'Found', meaning: 'A temporary redirect; keep using the original URL.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 303, name: 'See Other', meaning: 'Follow the Location with GET — the classic post/redirect/get.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 304, name: 'Not Modified', meaning: 'Your cached copy is still fresh; nothing is sent.', body: false, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 305, name: 'Use Proxy', meaning: 'Deprecated: the resource must be reached through a proxy.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 307, name: 'Temporary Redirect', meaning: 'Like 302 but the method and body must not change.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 308, name: 'Permanent Redirect', meaning: 'Like 301 but the method and body must not change.', body: true, cacheable: 'default', spec: 'RFC 9110' },

  // ---------------------------------------------------------------- 4xx
  { code: 400, name: 'Bad Request', meaning: 'The server could not understand the request as written.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 401, name: 'Unauthorized', meaning: 'Authentication is required or the credentials were wrong.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 402, name: 'Payment Required', meaning: 'Reserved for payment flows; rarely used in practice.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 403, name: 'Forbidden', meaning: 'The server understood but refuses — authentication will not help.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 404, name: 'Not Found', meaning: 'No resource at this address, and no hint whether it ever existed.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 405, name: 'Method Not Allowed', meaning: 'The URL exists but not for this method; see the Allow header.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 406, name: 'Not Acceptable', meaning: 'Nothing on offer matches the Accept headers you sent.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 407, name: 'Proxy Authentication Required', meaning: 'Like 401, but the proxy is the one asking.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 408, name: 'Request Timeout', meaning: 'The client took too long to send the request.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 409, name: 'Conflict', meaning: 'The request clashes with the current state, e.g. an edit conflict.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 410, name: 'Gone', meaning: 'Deliberately removed and not coming back — stronger than 404.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 411, name: 'Length Required', meaning: 'A Content-Length header is required for this request.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 412, name: 'Precondition Failed', meaning: 'An If-Match or If-Unmodified-Since condition did not hold.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 413, name: 'Content Too Large', meaning: 'The request body is bigger than the server will accept.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 414, name: 'URI Too Long', meaning: 'The URL is longer than the server is willing to parse.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 415, name: 'Unsupported Media Type', meaning: 'The Content-Type of the body is not supported here.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 416, name: 'Range Not Satisfiable', meaning: 'The requested byte range lies outside the resource.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 417, name: 'Expectation Failed', meaning: 'The Expect header could not be met by the server.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 418, name: "I'm a teapot", meaning: 'An April Fools joke from 1998 that servers still answer with.', body: true, cacheable: 'headers', spec: 'RFC 2324' },
  { code: 421, name: 'Misdirected Request', meaning: 'This connection cannot produce a response for that authority.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 422, name: 'Unprocessable Content', meaning: 'Syntax is fine but the content is semantically wrong — validation failed.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 423, name: 'Locked', meaning: 'WebDAV: the resource is locked by someone else.', body: true, cacheable: 'headers', spec: 'RFC 4918' },
  { code: 424, name: 'Failed Dependency', meaning: 'WebDAV: an earlier request in the chain failed.', body: true, cacheable: 'headers', spec: 'RFC 4918' },
  { code: 425, name: 'Too Early', meaning: 'The server will not risk replaying an early-data request.', body: true, cacheable: 'headers', spec: 'RFC 8470' },
  { code: 426, name: 'Upgrade Required', meaning: 'Switch protocol — usually "use TLS" or "use HTTP/2".', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 428, name: 'Precondition Required', meaning: 'Send a conditional request so updates cannot overwrite each other.', body: true, cacheable: 'headers', spec: 'RFC 6585' },
  { code: 429, name: 'Too Many Requests', meaning: 'Rate limited — wait for the time in Retry-After.', body: true, cacheable: 'headers', spec: 'RFC 6585' },
  { code: 431, name: 'Request Header Fields Too Large', meaning: 'The headers are too big; a huge cookie is the usual cause.', body: true, cacheable: 'headers', spec: 'RFC 6585' },
  { code: 451, name: 'Unavailable For Legal Reasons', meaning: 'Blocked by a legal demand such as a court order.', body: true, cacheable: 'headers', spec: 'RFC 7725' },

  // ---------------------------------------------------------------- 5xx
  { code: 500, name: 'Internal Server Error', meaning: 'The server hit an unexpected condition — check its logs.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 501, name: 'Not Implemented', meaning: 'The server does not support the method at all.', body: true, cacheable: 'default', spec: 'RFC 9110' },
  { code: 502, name: 'Bad Gateway', meaning: 'A proxy got an invalid response from the server behind it.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 503, name: 'Service Unavailable', meaning: 'Down for maintenance or overloaded; try again after Retry-After.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 504, name: 'Gateway Timeout', meaning: 'A proxy waited too long for the server behind it.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 505, name: 'HTTP Version Not Supported', meaning: 'The HTTP version in the request is not supported.', body: true, cacheable: 'headers', spec: 'RFC 9110' },
  { code: 506, name: 'Variant Also Negotiates', meaning: 'Content negotiation is misconfigured and loops on itself.', body: true, cacheable: 'headers', spec: 'RFC 2295' },
  { code: 507, name: 'Insufficient Storage', meaning: 'WebDAV: not enough room to store the representation.', body: true, cacheable: 'headers', spec: 'RFC 4918' },
  { code: 508, name: 'Loop Detected', meaning: 'WebDAV: an infinite loop was found while processing.', body: true, cacheable: 'headers', spec: 'RFC 5842' },
  { code: 510, name: 'Not Extended', meaning: 'The request needs further extensions to be fulfilled.', body: true, cacheable: 'headers', spec: 'RFC 2774' },
  { code: 511, name: 'Network Authentication Required', meaning: 'A captive portal wants you to sign in to the network first.', body: true, cacheable: 'headers', spec: 'RFC 6585' },
];

export const CACHE_LABELS: Record<Cacheability, string> = {
  default: 'Cacheable by default',
  headers: 'Only with cache headers',
  never: 'Never cacheable',
};

/** Free-text search across the code, name and meaning. */
export function searchStatuses(query: string, filter: StatusClass | 'all'): StatusCode[] {
  const needle = query.trim().toLowerCase();
  return STATUS_CODES.filter((status) => {
    if (filter !== 'all' && statusClass(status.code) !== filter) return false;
    if (!needle) return true;
    return (
      String(status.code).includes(needle) ||
      status.name.toLowerCase().includes(needle) ||
      status.meaning.toLowerCase().includes(needle) ||
      CLASS_LABELS[statusClass(status.code)].toLowerCase().includes(needle)
    );
  });
}
