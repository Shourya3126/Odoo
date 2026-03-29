import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '../store';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

export function useSocket() {
  const token = useStore((s) => s.token);
  const user = useStore((s) => s.user);
  const showToast = useStore((s) => s.showToast);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token || !user) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔗 Live data stream connected');
    });

    socket.on('expense:submitted', (data: any) => {
      // Don't toast self for own submissions unless it's for an approver context
      if (data.expense?.user_id !== user.id && ['ADMIN', 'MANAGER'].includes(user.role)) {
         showToast(`New Expense Submitted: ${data.expense?.category} (${data.expense?.amount} ${data.expense?.currency})`, 'info');
      }
    });

    socket.on('approval:completed', (data: any) => {
      const { expenseId, status, approverName } = data;
      showToast(`Expense #${expenseId.substring(0, 6)} was ${status} by ${approverName}`, status === 'APPROVED' ? 'success' : 'info');
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user, showToast]);

  return socketRef.current;
}
