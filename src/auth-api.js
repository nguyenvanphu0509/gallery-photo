export async function authRequest(path, data, { method = 'POST' } = {}) {
  const multipart = data instanceof FormData;
  let response;
  try {
    response = await fetch(`/api/auth${path}`, {
      method: data === undefined ? 'GET' : method,
      credentials: 'same-origin',
      ...(data === undefined ? {} : multipart ? { body: data } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    });
  } catch {
    throw new Error('Không thể kết nối máy chủ. Vui lòng thử lại.');
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.');
  if (!body) throw new Error('Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.');
  return body;
}
