import React from 'react';
import { useSocket } from '../context/SocketContext';
import { Sparkles, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export default function ToastContainer() {
  const { toasts } = useSocket();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => {
        let borderClass = 'border-subtle';
        let icon = <Info size={18} color="#00f2fe" />;
        
        if (t.type === 'success') {
          borderClass = 'glow-cyan';
          icon = <CheckCircle2 size={18} color="#00e676" />;
        } else if (t.type === 'warning') {
          icon = <AlertTriangle size={18} color="#ffb300" />;
        } else if (t.type === 'danger') {
          borderClass = 'glow-rose';
          icon = <AlertTriangle size={18} color="#ff2a6d" />;
        } else if (t.type === 'primary') {
          borderClass = 'glow-cyan';
          icon = <Sparkles size={18} color="#00f2fe" />;
        }

        return (
          <div key={t.id} className={`toast ${borderClass}`}>
            {icon}
            <div>{t.message}</div>
          </div>
        );
      })}
    </div>
  );
}
