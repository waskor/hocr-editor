import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Modal, Space, Tooltip } from 'antd';
import { PrismAsync as SyntaxHighlighter } from 'react-syntax-highlighter';
import prism from 'react-syntax-highlighter/dist/esm/styles/prism/prism';
import { useCopyToClipboard } from 'react-use';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import printHtml from '../../lib/htmlPrinter';
import buildHocrDocument from '../../lib/hocrBuilder';
import { OcrDocument } from '../../reducer/types';

import './index.css';

interface Props {
  documents: OcrDocument[];
  onClose?: () => void;
  show?: boolean;
}

export default function ExportModal({ documents, onClose, show }: Props) {
  const [hocr, setHocr] = useState<string | null>(null);

  const hocrDownload = useMemo(() => (hocr ? `data:text/html;charset=utf-8,${encodeURIComponent(hocr)}` : '#'), [hocr]);

  const [showClipboardTooltip, setShowClipboardTooltip] = useState(false);
  const [, copyToClipboard] = useCopyToClipboard();

  const handleCopyToClipboard = useCallback(() => {
    copyToClipboard(hocr ?? '');
    setShowClipboardTooltip(true);
  }, [hocr, copyToClipboard]);

  useEffect(() => {
    if (documents.some((doc) => !doc?.tree) || !show || !!hocr) {
      return;
    }

    const doc = buildHocrDocument(documents);

    setHocr(printHtml(doc));
  }, [show, hocr, documents]);

  useEffect(() => {
    let timeoutId: number;

    if (showClipboardTooltip) {
      timeoutId = window.setTimeout(() => setShowClipboardTooltip(false), 1000);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [showClipboardTooltip]);

  return (
    <Modal
      onCancel={onClose}
      onOk={onClose}
      visible={show}
      centered
      title="Export hOCR"
      className="ExportModal"
      width={960}
      footer={
        <Space>
          <Tooltip title="Copied!" placement="left" trigger={[]} visible={showClipboardTooltip}>
            <Button type="primary" onClick={handleCopyToClipboard} icon={<FontAwesomeIcon icon="copy" />}>
              Copy
            </Button>
          </Tooltip>
          <Button
            type="primary"
            href={hocrDownload}
            download="file.hocr"
            icon={<FontAwesomeIcon icon="file-download" />}
          >
            Download
          </Button>
        </Space>
      }
    >
      {hocr && (
        <SyntaxHighlighter language="markup" style={prism}>
          {hocr}
        </SyntaxHighlighter>
      )}
    </Modal>
  );
}
