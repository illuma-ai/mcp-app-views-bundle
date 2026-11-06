import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ContextErrorWithRetry from '../ContextErrorWithRetry';

const mockCompact = jest.fn();
const mockAsk = jest.fn();
const state = {
  chat: true as boolean,
  isCompacting: false,
  canCompact: true,
  latest: null as null | Record<string, unknown>,
};

const mockMessages = [
  { messageId: 'user-1', parentMessageId: 'root', text: 'summarise the report' },
  {
    messageId: 'err',
    parentMessageId: 'user-1',
    conversationId: 'c1',
    text: '',
    content: [{ type: 'error' }],
  },
];

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: jest.fn() }),
}));
jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string => {
      const ext = jest.requireActual('~/ext/locales/en/translation.json') as Record<string, string>;
      return ext[key] ?? key;
    },
}));
jest.mock('~/Providers/ChatContext', () => {
  const actual = jest.requireActual('react');
  const ChatContext = actual.createContext(undefined);
  return { ChatContext, useChatContext: () => ({ index: 0 }) };
});
jest.mock('~/Providers/MessagesViewContext', () => ({
  useIsMessagesViewReadOnly: () => false,
  useOptionalMessagesConversation: () => ({ conversation: { endpoint: 'agents' } }),
  useOptionalMessagesOperations: () => ({ ask: mockAsk, getMessages: () => mockMessages }),
}));
jest.mock('~/Providers/MessageContext', () => ({
  useMessageContext: () => ({ messageId: 'err', partIndex: 0 }),
}));
jest.mock('~/hooks/Chat/useCompactConversation', () => ({
  __esModule: true,
  default: () => ({
    compact: mockCompact,
    canCompact: state.canCompact,
    isCompacting: state.isCompacting,
  }),
  supportsCompaction: () => true,
}));
jest.mock('~/hooks/Messages/useLatestMessage', () => ({ useLatestMessage: () => state.latest }));
jest.mock('~/hooks/Conversations/useGetAddedConvo', () => () => () => null);
jest.mock('~/components/Messages/Content/Error/ContextError', () => () => (
  <p data-testid="context-card" />
));
jest.mock('~/components/Messages/Content/Error/parts', () => ({
  ErrorActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ErrorAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  useErrorEndpoint: () => ({ compactionAvailable: true }),
}));

const compactedLeaf = {
  messageId: 'summary',
  conversationId: 'c1',
  content: [
    {
      type: 'summary',
      boundary: { messageId: 'user-1' },
      content: [{ type: 'text', text: 'checkpoint' }],
    },
  ],
};

function renderCard(inChat: boolean) {
  const { ChatContext } = jest.requireMock('~/Providers/ChatContext');
  return render(
    <ChatContext.Provider value={inChat ? {} : undefined}>
      <ContextErrorWithRetry json={{ type: 'final_context_overflow' }} text="" />
    </ChatContext.Provider>,
  );
}

describe('ContextErrorWithRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(state, { isCompacting: false, canCompact: true, latest: null });
  });

  it('shows the card alone outside a live chat', () => {
    renderCard(false);
    expect(screen.getByTestId('context-card')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('compacts on click, then resends the failed message from the summary', () => {
    const view = render(<ContextErrorWithRetryHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Compact and retry' }));
    expect(mockCompact).toHaveBeenCalledTimes(1);
    expect(mockAsk).not.toHaveBeenCalled();

    state.isCompacting = true;
    view.rerender(<ContextErrorWithRetryHarness />);
    state.isCompacting = false;
    state.latest = compactedLeaf;
    view.rerender(<ContextErrorWithRetryHarness />);

    expect(mockAsk).toHaveBeenCalledTimes(1);
    expect(mockAsk.mock.calls[0][0]).toMatchObject({
      text: 'summarise the report',
      parentMessageId: 'summary',
      conversationId: 'c1',
    });
  });
});

function ContextErrorWithRetryHarness() {
  const { ChatContext } = jest.requireMock('~/Providers/ChatContext');
  return (
    <ChatContext.Provider value={{}}>
      <ContextErrorWithRetry json={{ type: 'final_context_overflow' }} text="" />
    </ChatContext.Provider>
  );
}
