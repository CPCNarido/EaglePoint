import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import ErrorModal from './ErrorModal';

type ModalType = 'credentials'|'network'|'server'|'timeout'|'other'|'validation'|'success'|null;

type ShowArgs = {
  type?: ModalType;
  title?: string;
  message: string;
  details?: any;
  onRetry?: () => void;
};

type GlobalModalApi = {
  show: (args: ShowArgs) => void;
  showSuccess: (title: string | undefined, message: string) => void;
  hide: () => void;
};

const GlobalModalContext = createContext<GlobalModalApi | null>(null);

export function useGlobalModal() {
  const ctx = useContext(GlobalModalContext);
  if (!ctx) throw new Error('useGlobalModal must be used within GlobalModalProvider');
  return ctx;
}

export default function GlobalModalProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [type, setType] = useState<ModalType>(null);
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState<any>(null);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [onRetry, setOnRetry] = useState<(() => void) | undefined>(undefined);

  const show = useCallback((args: ShowArgs) => {
    setType(args.type ?? null);
    setTitle(args.title ?? (args.type === 'success' ? 'Success' : undefined));
    setMessage(args.message ?? '');
    setDetails(args.details ?? null);
    setOnRetry(() => args.onRetry);
    setVisible(true);
  }, []);

  const showSuccess = useCallback((t: string | undefined, m: string) => {
    show({ type: 'success', title: t, message: m });
  }, [show]);

  const hide = useCallback(() => setVisible(false), []);

  const api: GlobalModalApi = { show, showSuccess, hide };

  return (
    <GlobalModalContext.Provider value={api}>
      {children}
      <ErrorModal
        visible={visible}
        errorType={type}
        errorMessage={message}
        errorDetails={details}
        onClose={() => setVisible(false)}
        onRetry={onRetry}
      />
    </GlobalModalContext.Provider>
  );
}
