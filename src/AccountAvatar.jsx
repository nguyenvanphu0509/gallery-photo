import React, { useEffect, useState } from 'react';

export default function AccountAvatar({ user, large = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.avatarUrl]);
  return <span className={`account-avatar${large ? ' account-avatar-large' : ''}`} aria-hidden="true">
    {user.avatarUrl && !failed
      ? <img src={user.avatarUrl} width={large ? 64 : 32} height={large ? 64 : 32} alt="" onError={() => setFailed(true)} />
      : Array.from(user.name.trim())[0]?.toLocaleUpperCase() || '?'}
  </span>;
}
