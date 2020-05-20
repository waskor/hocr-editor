﻿import { createAction } from "@reduxjs/toolkit";
import { RecognizeResult } from "tesseract.js";
import { ChangeCallbackParams } from "../components/PageCanvas/Block";
import { ActionType, MoveNodeParams } from "./types";

export const createInit = createAction<RecognizeResult, ActionType.Init>(ActionType.Init);
// export const createUpdateTree = createAction<BlockTreeItem[], ActionType.UpdateTree>(ActionType.UpdateTree);
export const createUpdateTreeNodeRect = createAction<ChangeCallbackParams, ActionType.UpdateTreeNodeRect>(ActionType.UpdateTreeNodeRect);
export const createChangeSelected = createAction<number | null, ActionType.ChangeSelected>(ActionType.ChangeSelected);
export const createChangeHovered = createAction<number | null, ActionType.ChangeHovered>(ActionType.ChangeHovered);
export const createDeleteNode = createAction<number, ActionType.DeleteNode>(ActionType.DeleteNode);
export const createMoveNode = createAction<MoveNodeParams, ActionType.MoveNode>(ActionType.MoveNode);