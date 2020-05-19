import { Bbox, RecognizeResult } from "tesseract.js";
import { createAction } from '@reduxjs/toolkit';
import produce from 'immer';

import { BaseTreeItem, ElementType, Position } from "./types";
import { buildTree, walkChildren } from "./treeBuilder";
import { ChangeCallbackParams } from "./components/PageCanvas/Block";


export type TreeMap = { [id: number]: BaseTreeItem<ElementType, any> };

export interface State {
  tree: number[];
  treeMap: TreeMap | null;
  selectedId: number | null;
  hoveredId: number | null;
}

export enum ActionType {
  Init = 'Init',
  UpdateTree = 'UpdateTree',
  UpdateTreeNodeRect = 'UpdateTreeNodeRect',
  ChangeSelected = 'ChangeSelected',
  ChangeHovered = 'ChangeHovered',
  MoveNode = 'MoveNode',
}

interface MoveNodeParams {
  nodeId: number;
  nextParentId: number | null;
  newIndex: number | null;
}

export type Action<T extends string, P = void> = { type: T, payload: P };

export type ReducerAction =
  Action<ActionType.Init, RecognizeResult> |
  // Action<ActionType.UpdateTree, BlockTreeItem[]> |
  Action<ActionType.UpdateTreeNodeRect, ChangeCallbackParams> |
  Action<ActionType.ChangeSelected, number | null> |
  Action<ActionType.ChangeHovered, number | null> |
  Action<ActionType.MoveNode, MoveNodeParams>;

export const createInit = createAction<RecognizeResult, ActionType.Init>(ActionType.Init);
// export const createUpdateTree = createAction<BlockTreeItem[], ActionType.UpdateTree>(ActionType.UpdateTree);
export const createUpdateTreeNodeRect = createAction<ChangeCallbackParams, ActionType.UpdateTreeNodeRect>(ActionType.UpdateTreeNodeRect);
export const createChangeSelected = createAction<number | null, ActionType.ChangeSelected>(ActionType.ChangeSelected);
export const createChangeHovered = createAction<number | null, ActionType.ChangeHovered>(ActionType.ChangeHovered);
export const createMoveNode = createAction<MoveNodeParams, ActionType.MoveNode>(ActionType.MoveNode);

const offsetBbox = (bbox: Bbox, offset: Position): Bbox => ({
  x0: bbox.x0 + offset.x,
  y0: bbox.y0 + offset.y,
  x1: bbox.x1 + offset.x,
  y1: bbox.y1 + offset.y,
});

// function walkTreeMap<T extends BaseTreeItem<ElementType, any>>(tree: T[], transform: (item: T) => T): T[] {
//   function walk(item: T): T {
//     const transformedItem = transform(item);
//
//     if (transformedItem.children && typeof transformedItem.children !== 'function') {
//       transformedItem.children = walkTreeMap(item.children ?? [], transform);
//     }
//
//     return transformedItem;
//   }
//
//   return tree.map(block => walk(block));
// }

export const initialState: State = {
  tree: [],
  treeMap: null,
  selectedId: null,
  hoveredId: null,
};


function updateTreeNodePosition(state: State, nodeId: number, x: number, y: number, width: number | undefined, height: number | undefined): State {
  return produce(state, (draft) => {
    const treeMap = draft.treeMap;

    if (!treeMap) {
      return;
    }

    const node = treeMap[nodeId];

    if (!node) {
      throw new Error(`Could not find node with ID ${nodeId}.`);
    }

    const delta: Position = {
      x: x - node.parentRelativeOffset.x,
      y: y - node.parentRelativeOffset.y,
    };

    const newPosition: Position = {
      x: node.value.bbox.x0 + delta.x,
      y: node.value.bbox.y0 + delta.y,
    };

    // TODO: Round and clamp to parent bounds.
    const newBbox: Bbox = {
      x0: newPosition.x,
      y0: newPosition.y,
      x1: typeof width === 'undefined' ? node.value.bbox.x1 + delta.x : newPosition.x + width,
      y1: typeof height === 'undefined' ? node.value.bbox.y1 + delta.y : newPosition.y + height,
    };

    node.parentRelativeOffset = { x, y, };
    node.value.bbox = newBbox;

    walkChildren(node.children, treeMap, item => {
      treeMap[item.id].value.bbox = offsetBbox(item.value.bbox, delta);
    });
  });
}

function moveTreeNode(state: State, nodeId: number, nextParentId: number | null, newIndex: number | null): State {
  return produce(state, (draft) => {
    const treeMap = draft.treeMap;

    if (!treeMap || nextParentId === null) {
      return;
    }

    const node = treeMap[nodeId];

    if (!node) {
      throw new Error(`Could not find node with ID ${nodeId}`);
    }
    
    const prevParentId = node.parentId;

    const newParentNode = treeMap[nextParentId];

    // If node was only swapped, remove it first so we can insert it again.
    const newParentChildren = newParentNode.children.filter(id => id !== nodeId);

    // Insert node in its new place.
    newParentChildren.splice(newIndex ?? 0, 0, nodeId);

    // Create tree map again. Give node its new parent, give parent its new children.
    treeMap[nodeId].parentId = nextParentId;
    treeMap[nextParentId].children = newParentChildren;

    // If node was moved from a previous, separate parent, remove it from that parent's children list. 
    if (typeof prevParentId === 'number' && prevParentId !== nextParentId) {
      const prevParent = treeMap[prevParentId];

      if (!prevParent) {
        throw new Error(`Could not find node with ID ${prevParentId}`);
      }

      // Since updatedTreeMap is already a new object, it's safe to simply set new values.
      prevParent.children = prevParent.children.filter(id => id !== nodeId);
    }
    
    // If node was a top-level Block, it was swapped. Rebuild the root array.
    const prevIndex = draft.tree.findIndex(item => item === nodeId);

    if (prevIndex < 0) {
      return;
    }

    draft.tree.splice(prevIndex, 1);
    draft.tree.splice(newIndex ?? 0, 0, nodeId);
  });
}

export function reducer(state: State, action: ReducerAction): State {
  switch (action.type) {
    case ActionType.Init: {
      return produce(state, (draft) => {
        const [blockTreeItems, treeMap] = buildTree(action.payload);
        
        draft.tree = blockTreeItems;
        draft.treeMap = treeMap;
      });
    }
    case ActionType.ChangeSelected: {
      return produce(state, (draft) => {
        draft.selectedId = action.payload;
      });
    }
    case ActionType.ChangeHovered: {
      return produce(state, (draft) => {
        draft.hoveredId = action.payload;
      });
    }
    // case ActionType.UpdateTree: {
    //   return {
    //     ...state,
    //     treeMap: action.payload,
    //   };
    // }
    case ActionType.UpdateTreeNodeRect: {
      return updateTreeNodePosition(state, action.payload.nodeId, action.payload.x, action.payload.y, action.payload.width, action.payload.height);
    }
    case ActionType.MoveNode: {
      return moveTreeNode(state, action.payload.nodeId, action.payload.nextParentId, action.payload.newIndex);
    }
    default:
      throw new Error(`Unknown action ${action}`);
  }
}