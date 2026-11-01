import React, { useState } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface MarkdownContentProps {
  content: string;
  onLoadClick?: (loadNumber: string) => void;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, onLoadClick }) => {
  const [copiedBlockIdx, setCopiedBlockIdx] = useState<number | null>(null);

  const handleCopyBlock = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedBlockIdx(idx);
    setTimeout(() => setCopiedBlockIdx(null), 2000);
  };

  // Helper to render text with inline bold, italic, code, and load tags
  const renderInlineFormatted = (text: string, keyPrefix: string) => {
    // Regex matches:
    // 1. Code blocks: `code`
    // 2. Bold text: **bold**
    // 3. Italic text: *italic*
    // 4. Load tags: (?:Load\s*#?|#)(LD-[A-Za-z0-9-]+) or (LD-[0-9]{4,})
    // 5. Status badges: \[([A-Z_]{3,})\]
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let idx = 0;

    // Tokenizer regex
    const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[(?:Load\s*#?|#)?(LD-[A-Za-z0-9-]+)\]|(?:Load\s*#?|#)(LD-[A-Za-z0-9-]+)|\[([A-Z_]{3,})\])/g;
    let match;
    let lastIndex = 0;

    while ((match = inlineRegex.exec(remaining)) !== null) {
      // Text before match
      if (match.index > lastIndex) {
        parts.push(
          <span key={`${keyPrefix}-txt-${idx++}`}>
            {remaining.substring(lastIndex, match.index)}
          </span>
        );
      }

      const matchedStr = match[0];

      if (matchedStr.startsWith('`') && matchedStr.endsWith('`')) {
        const codeText = matchedStr.slice(1, -1);
        parts.push(
          <code
            key={`${keyPrefix}-code-${idx++}`}
            className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-indigo-300 font-mono text-xs"
          >
            {codeText}
          </code>
        );
      } else if (matchedStr.startsWith('**') && matchedStr.endsWith('**')) {
        const boldText = matchedStr.slice(2, -2);
        parts.push(
          <strong key={`${keyPrefix}-bold-${idx++}`} className="font-semibold text-slate-100">
            {renderInlineFormatted(boldText, `${keyPrefix}-b-${idx}`)}
          </strong>
        );
      } else if (matchedStr.startsWith('*') && matchedStr.endsWith('*')) {
        const italicText = matchedStr.slice(1, -1);
        parts.push(
          <em key={`${keyPrefix}-italic-${idx++}`} className="italic text-slate-300">
            {renderInlineFormatted(italicText, `${keyPrefix}-i-${idx}`)}
          </em>
        );
      } else if (match[2] || match[3]) {
        // Load Number match
        const loadNum = match[2] || match[3];
        parts.push(
          <button
            key={`${keyPrefix}-load-${idx++}`}
            type="button"
            onClick={() => onLoadClick && onLoadClick(loadNum)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded bg-indigo-950/70 hover:bg-indigo-900/90 text-indigo-300 hover:text-indigo-200 border border-indigo-800/60 font-mono text-xs font-semibold transition-colors cursor-pointer"
            title={`View Load Details for ${loadNum}`}
          >
            <span>{loadNum}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
          </button>
        );
      } else if (match[4]) {
        // Status Badge match
        const badge = match[4];
        let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';
        if (['IN_TRANSIT', 'PURPLE'].includes(badge)) {
          colorClass = 'bg-purple-950/60 text-purple-300 border-purple-800/60';
        } else if (['BOOKED', 'BLUE'].includes(badge)) {
          colorClass = 'bg-blue-950/60 text-blue-300 border-blue-800/60';
        } else if (['DELIVERED', 'TEAL', 'COMPLETED'].includes(badge)) {
          colorClass = 'bg-teal-950/60 text-teal-300 border-teal-800/60';
        } else if (['CRITICAL', 'AT_RISK', 'DELAYED', 'DELAY', 'BREAKDOWN'].includes(badge)) {
          colorClass = 'bg-rose-950/60 text-rose-300 border-rose-800/60';
        } else if (['PENDING', 'WARNING'].includes(badge)) {
          colorClass = 'bg-amber-950/60 text-amber-300 border-amber-800/60';
        }
        parts.push(
          <span
            key={`${keyPrefix}-badge-${idx++}`}
            className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide border ${colorClass}`}
          >
            {badge.replace('_', ' ')}
          </span>
        );
      } else {
        parts.push(<span key={`${keyPrefix}-raw-${idx++}`}>{matchedStr}</span>);
      }

      lastIndex = inlineRegex.lastIndex;
    }

    if (lastIndex < remaining.length) {
      parts.push(
        <span key={`${keyPrefix}-tail-${idx++}`}>{remaining.substring(lastIndex)}</span>
      );
    }

    return parts;
  };

  // Split into lines & blocks
  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockBuffer: string[] = [];
  let codeBlockIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        const codeText = codeBlockBuffer.join('\n');
        const currentIdx = codeBlockIdx++;
        renderedElements.push(
          <div
            key={`code-block-${currentIdx}`}
            className="my-3 rounded-lg border border-slate-800 bg-slate-950/90 overflow-hidden shadow-inner"
          >
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 font-mono">
              <span>Text Output</span>
              <button
                type="button"
                onClick={() => handleCopyBlock(codeText, currentIdx)}
                className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                {copiedBlockIdx === currentIdx ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-sans text-xs">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span className="font-sans text-xs">Copy Text</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3.5 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {codeText}
            </pre>
          </div>
        );
        inCodeBlock = false;
        codeBlockBuffer = [];
      } else {
        // Start of code block
        inCodeBlock = true;
        codeBlockBuffer = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(line);
      continue;
    }

    // Horizontal Divider
    if (line.trim() === '---' || line.trim() === '***') {
      renderedElements.push(
        <hr key={`hr-${i}`} className="my-4 border-slate-800" />
      );
      continue;
    }

    // Heading 3
    if (line.startsWith('### ')) {
      renderedElements.push(
        <h3
          key={`h3-${i}`}
          className="text-base sm:text-lg font-bold text-slate-100 mt-4 mb-2 flex items-center gap-2 border-b border-slate-800/80 pb-1.5"
        >
          {renderInlineFormatted(line.replace('### ', ''), `h3-${i}`)}
        </h3>
      );
      continue;
    }

    // Heading 4
    if (line.startsWith('#### ')) {
      renderedElements.push(
        <h4
          key={`h4-${i}`}
          className="text-xs sm:text-sm font-semibold text-slate-200 uppercase tracking-wider text-slate-300 mt-3 mb-1.5"
        >
          {renderInlineFormatted(line.replace('#### ', ''), `h4-${i}`)}
        </h4>
      );
      continue;
    }

    // Bullet Point (* or -)
    if (/^[\*\-]\s+/.test(line.trim())) {
      const bulletContent = line.trim().replace(/^[\*\-]\s+/, '');
      const isWarning = bulletContent.startsWith('⚠️') || bulletContent.startsWith('🚨') || bulletContent.startsWith('🔴');
      const isSuccess = bulletContent.startsWith('✅');

      let bulletBg = 'text-slate-300';
      if (isWarning) bulletBg = 'text-amber-200 bg-amber-950/20 px-2 py-1 rounded border border-amber-800/30';
      if (isSuccess) bulletBg = 'text-emerald-200 bg-emerald-950/20 px-2 py-1 rounded border border-emerald-800/30';

      renderedElements.push(
        <div key={`bullet-${i}`} className={`flex items-start gap-2 my-1 text-xs sm:text-sm ${bulletBg}`}>
          <span className="text-indigo-400 mt-1 shrink-0 font-bold">•</span>
          <div className="flex-1 leading-relaxed">
            {renderInlineFormatted(bulletContent, `li-${i}`)}
          </div>
        </div>
      );
      continue;
    }

    // Numbered item (1. 2.)
    if (/^\d+\.\s+/.test(line.trim())) {
      const matchNum = line.trim().match(/^(\d+)\.\s+(.*)$/);
      if (matchNum) {
        const num = matchNum[1];
        const numContent = matchNum[2];
        renderedElements.push(
          <div key={`num-${i}`} className="flex items-start gap-2.5 my-1 text-xs sm:text-sm text-slate-300">
            <span className="w-4 h-4 rounded-full bg-slate-800 text-indigo-300 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 border border-slate-700">
              {num}
            </span>
            <div className="flex-1 leading-relaxed">
              {renderInlineFormatted(numContent, `num-li-${i}`)}
            </div>
          </div>
        );
        continue;
      }
    }

    // Blank line
    if (!line.trim()) {
      renderedElements.push(<div key={`blank-${i}`} className="h-2" />);
      continue;
    }

    // Standard paragraph
    renderedElements.push(
      <p key={`p-${i}`} className="text-xs sm:text-sm text-slate-300 leading-relaxed my-1">
        {renderInlineFormatted(line, `p-${i}`)}
      </p>
    );
  }

  // If unclosed code block at end
  if (inCodeBlock && codeBlockBuffer.length > 0) {
    const codeText = codeBlockBuffer.join('\n');
    renderedElements.push(
      <pre
        key="dangling-code"
        className="my-3 p-3.5 rounded-lg border border-slate-800 bg-slate-950/90 text-xs font-mono text-slate-200 overflow-x-auto whitespace-pre-wrap"
      >
        {codeText}
      </pre>
    );
  }

  return <div className="space-y-1">{renderedElements}</div>;
};
