import React from 'react';
import { useMeasure, useTitle } from "react-use";
import { Button, Spinner } from 'react-bootstrap';

import { ItemId, PageImage, Position, RecognizeUpdate } from '../../types';
import { createInit, createChangeSelected } from '../../reducer/actions';
import PageGraphics from "./PageGraphics";
import { recognize } from "../../ocr";
import { useAppReducer } from "../../reducerContext";

import './index.css';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Props {
  pageImage?: PageImage;
}

const TITLE = document.title;

const SCALE_MAX = 3.0;
const SCALE_MIN = 0.05;

export default function PageCanvas(props: Props) {
  const [ref, { width, height }] = useMeasure();
  const [scale, setScale] = React.useState(1);
  const [position, setPosition] = React.useState<Position>({ x: 0, y: 0 });

  const [processing, setProcessing] = React.useState<boolean>(false);
  const [progress, setProgress] = React.useState(0);

  const [state, dispatch] = useAppReducer();

  useTitle(processing ? `(${(progress * 100).toFixed(1)}%) ${TITLE}` : TITLE);

  const setFitScale = React.useCallback(() => {
    if (!props.pageImage) {
      return;
    }

    const fitScale = props.pageImage.image.width > props.pageImage.image.height ?
      (width / props.pageImage.image.width) :
      (height / props.pageImage.image.height);

    setScale(fitScale);
    setPosition({
      x: (width - props.pageImage.image.width * fitScale) * .5,
      y: (height - props.pageImage.image.height * fitScale) * .5,
    });
  }, [props.pageImage, height, width]);

  React.useLayoutEffect(setFitScale, [setFitScale]);

  function handleSelected(itemId: ItemId | null) {
    dispatch(createChangeSelected(itemId));
  }

  function handleMouseWheel(evt: React.WheelEvent) {
    const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, scale * Math.pow(2, -evt.deltaY * 0.05)));

    setScale(newScale);
  }

  async function performOCR() {
    if (!props.pageImage) {
      return;
    }

    setProcessing(true);

    const result = await recognize(props.pageImage.urlObject, "heb+eng", {
      logger: (update: RecognizeUpdate) => {
        if (update.status.startsWith("recognizing")) {

          setProgress(update.progress);
        }
      },
    });

    dispatch(createInit(result));
    setProcessing(false);
  }

  return (
    <div
      className="Canvas"
      onWheel={handleMouseWheel}
    >
      <div className="Canvas-toolbar">
        <Button
          size="sm"
          variant="primary"
          disabled={!props.pageImage || processing}
          onClick={performOCR}
        >
          {processing && (
            <Spinner
              as="span"
              animation="border"
              size="sm"
              role="status"
              aria-hidden="true"
            />
          )}{" "}
          OCR
          {processing && ` (${(progress * 100).toFixed(1)}%)`}
        </Button>
        {' '}
        <Button
          size="sm"
          onClick={setFitScale}
          disabled={!props.pageImage}
          variant="outline-dark"
          title="Fit image"
        >
          <FontAwesomeIcon icon="expand" />
        </Button>
      </div>
      <div
        className="Canvas-main"
        ref={ref}
      >
        <PageGraphics
          width={width}
          height={height}
          onSelect={handleSelected}
          onDeselect={() => handleSelected(null)}
          hoveredId={state.hoveredId}
          selectedId={state.selectedId}
          pageImage={props.pageImage}
          scale={scale}
          position={position}
          setPosition={setPosition}
        />
      </div>
    </div>
  );
}