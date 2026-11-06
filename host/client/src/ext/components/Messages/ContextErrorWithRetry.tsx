import { useContext, useEffect, useRef, useState } from 'react';
import { useToastContext } from '@librechat/client';
import { findMessageById, isCompactedLeaf, ContentTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ErrorRendererProps } from '~/components/Messages/Content/Error/parts';
import {
  useIsMessagesViewReadOnly,
  useOptionalMessagesConversation,
  useOptionalMessagesOperations,
} from '~/Providers/MessagesViewContext';
import {
  ErrorAction,
  ErrorActions,
  useErrorEndpoint,
} from '~/components/Messages/Content/Error/parts';
import useCompactConversation, { supportsCompaction } from '~/hooks/Chat/useCompactConversation';
import ContextError from '~/components/Messages/Content/Error/ContextError';
import useGetAddedConvo from '~/hooks/Conversations/useGetAddedConvo';
import { ChatContext, useChatContext } from '~/Providers/ChatContext';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useMessageContext } from '~/Providers/MessageContext';
import { useLocalize } from '~/hooks';

/** How long to wait for a compaction to start before giving the button back. */
const COMPACTION_START_TIMEOUT_MS = 10000;

/** An error row renders one card per error part; the action belongs under the last one. */
function isLastErrorPart(message: TMessage, partIndex: number | undefined): boolean {
  if (partIndex == null || !Array.isArray(message.content)) {
    return true;
  }
  for (let i = message.content.length - 1; i >= 0; i--) {
    if (message.content[i]?.type === ContentTypes.ERROR) {
      return i === partIndex;
    }
  }
  return true;
}

/**
 * One click: compact the conversation, then send the message that failed again from the summary.
 * The failed turn stays in the history; the resend continues from the compaction boundary so the
 * new turn starts from the summarised context instead of the one that overflowed.
 */
function CompactAndRetryAction({ failedMessage }: { failedMessage: TMessage }) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { index } = useChatContext();
  const { compact, canCompact, isCompacting } = useCompactConversation();
  const { ask, getMessages } = useOptionalMessagesOperations();
  const getAddedConvo = useGetAddedConvo();
  const latest = useLatestMessage(index);
  const [waiting, setWaiting] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!waiting) {
      return undefined;
    }
    if (isCompacting) {
      started.current = true;
      return undefined;
    }
    if (started.current) {
      /** The compaction turn has settled: resend from its boundary, or say it did not take. */
      started.current = false;
      setWaiting(false);
      const parent = findMessageById(getMessages(), failedMessage.parentMessageId);
      if (latest != null && isCompactedLeaf(latest) && parent != null) {
        ask(
          {
            text: parent.text,
            parentMessageId: latest.messageId,
            conversationId: latest.conversationId ?? failedMessage.conversationId,
          },
          {
            overrideManualSkills: parent.manualSkills,
            overrideQuotes: parent.quotes,
            overrideReasoning: parent.reasoningOverride ?? null,
            addedConvo: getAddedConvo() || undefined,
          },
        );
      } else {
        showToast({ message: localize('com_error_compaction_failed'), status: 'error' });
      }
      return undefined;
    }
    const timer = setTimeout(() => setWaiting(false), COMPACTION_START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [
    waiting,
    isCompacting,
    latest,
    ask,
    getMessages,
    getAddedConvo,
    failedMessage,
    showToast,
    localize,
  ]);

  const onClick = () => {
    started.current = false;
    setWaiting(true);
    compact();
  };

  return (
    <div className="mt-2">
      <ErrorActions>
        <ErrorAction onClick={onClick} disabled={!canCompact || waiting}>
          {localize(waiting ? 'com_ext_context_compacting_retry' : 'com_ext_context_compact_retry')}
        </ErrorAction>
      </ErrorActions>
    </div>
  );
}

/**
 * The context-limit error card plus a "Compact and retry" action. Only a live, writable chat can
 * compact and resend, so search results, shared links and read-only subagent threads show the
 * card alone, and none of them mounts the hooks the action needs.
 */
export default function ContextErrorWithRetry(props: ErrorRendererProps) {
  const chat = useContext(ChatContext);
  const readOnly = useIsMessagesViewReadOnly();
  const { conversation } = useOptionalMessagesConversation();
  const { getMessages } = useOptionalMessagesOperations();
  const { messageId, partIndex } = useMessageContext();
  const { compactionAvailable } = useErrorEndpoint(props.message);

  let action: React.ReactNode = null;
  if (
    chat != null &&
    !readOnly &&
    compactionAvailable &&
    conversation?.subagentThread == null &&
    supportsCompaction(conversation?.endpoint)
  ) {
    const failed = findMessageById(getMessages(), messageId);
    if (failed != null && failed.parentMessageId && isLastErrorPart(failed, partIndex)) {
      action = <CompactAndRetryAction failedMessage={failed} />;
    }
  }

  return (
    <>
      <ContextError {...props} />
      {action}
    </>
  );
}
