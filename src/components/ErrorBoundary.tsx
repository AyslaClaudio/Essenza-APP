import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { logger } from '../lib/logger';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Erro capturado por Error Boundary', error);
    console.error('Error details:', errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
          <div className="bg-essenza-dark-card border border-essenza-dark-border rounded-2xl p-8 max-w-md w-full text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={32} className="text-red-400" />
              </div>
            </div>
            <h1 className="text-white text-2xl font-bold mb-2">Oops! Algo deu errado</h1>
            <p className="text-neutral-400 mb-6">
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            {this.state.error && (
              <div className="bg-neutral-900 rounded-lg p-3 mb-6 text-left max-h-32 overflow-y-auto">
                <p className="text-red-400 text-xs font-mono">{this.state.error.message}</p>
              </div>
            )}
            <button
              onClick={this.handleReload}
              className="w-full bg-[#E50914] text-white py-3 rounded-xl font-bold hover:bg-[#f6121d] active:scale-95"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
