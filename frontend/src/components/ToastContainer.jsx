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
        let icon = <Info size={18} className="toast-icon-primary" />;
        
        if (t.type === 'success') {
          borderClass = 'glow-cyan';
          icon = <CheckCircle2 size={18} className="toast-icon-success" />;
        } else if (t.type === 'warning') {
          icon = <AlertTriangle size={18} className="toast-icon-warning" />;
        } else if (t.type === 'danger') {
          borderClass = 'glow-rose';
          icon = <AlertTriangle size={18} className="toast-icon-danger" />;
        } else if (t.type === 'primary') {
          borderClass = 'glow-cyan';
          icon = <Sparkles size={18} className="toast-icon-primary" />;
        }

        return (
          <div key={t.id} className={`toast ${borderClass}`}>
            {icon}
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
