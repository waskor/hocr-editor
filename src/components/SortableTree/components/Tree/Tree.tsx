
import { noop } from '../../utils/handy';
import { flattenTree, mutateTree } from '../../utils/tree';
import { FlattenedItem, ItemId, Path, TreeData, TreeDestinationPosition, TreeSourcePosition } from '../../types';
import TreeItem from '../TreeItem';
import { getDestinationPath, getItemById, getIndexById } from '../../utils/flat-tree';
import DelayedFunction from '../../utils/delayed-function';
import { DocumentTreeItem, ElementType } from '../../../../types';
import { Props, State, DragState } from './Tree-types';
import { calculateFinalDropPositions } from './Tree-utils';

import React, { Component, ReactElement } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
  Draggable,
  Droppable,
  DragDropContext,
  DragStart,
  DropResult,
  DragUpdate,
  DraggableProvided,
  DraggableStateSnapshot,
  DroppableProvided,
  DraggableRubric,
  DroppableStateSnapshot,
} from 'react-beautiful-dnd';
import { getBox } from 'css-box-model';

const TREE_DRAG_STATE_LEGAL = 'Tree-drag--legal';
const TREE_DRAG_STATE_ILLEGAL = 'Tree-drag--illegal';

const canNodeHaveChildren = (node: DocumentTreeItem): boolean => {
  if (node.type === ElementType.Block) {
    return node.data.type === 'block';
  }

  return node.type !== ElementType.Word;
};

function canMoveNode(
  tree: TreeData,
  sourcePosition: TreeSourcePosition,
  destinationPosition: TreeDestinationPosition | undefined,
): boolean {
  if (!destinationPosition) {
    return false;
  }

  const sourceParent = tree.items[+sourcePosition.parentId] as DocumentTreeItem;

  const destinationParent = tree.items[+destinationPosition.parentId] as DocumentTreeItem;

  return destinationParent.type === sourceParent.type && canNodeHaveChildren(destinationParent);
}

export default class Tree extends Component<Props, State> {
  static defaultProps = {
    tree: { children: [] },
    onExpand: noop,
    onCollapse: noop,
    onDragStart: noop,
    onDragEnd: noop,
    renderItem: noop,
    offsetPerLevel: 35,
    isDragEnabled: false,
    isNestingEnabled: false,
  };

  state = {
    flattenedTree: [],
    draggedItemId: undefined,
  };

  // State of dragging.
  dragState?: DragState;

  // HTMLElement for each rendered item
  itemsElement: Record<ItemId, HTMLElement | undefined> = {};

  // HTMLElement of the container element
  containerElement: HTMLElement | undefined;

  clonedElement: HTMLElement | null = null;

  expandTimer = new DelayedFunction(500);

  static getDerivedStateFromProps(props: Props, state: State) {
    const { draggedItemId } = state;
    const { tree } = props;

    const finalTree: TreeData = Tree.closeParentIfNeeded(tree, draggedItemId);
    const flattenedTree = flattenTree(finalTree);

    return {
      ...state,
      flattenedTree,
    };
  }

  static closeParentIfNeeded(tree: TreeData, draggedItemId?: ItemId): TreeData {
    if (!!draggedItemId) {
      // Closing parent internally during dragging, because visually we can only move one item not a subtree
      return mutateTree(tree, draggedItemId, {
        isExpanded: false,
      });
    }
    return tree;
  }

  onDragStart = (result: DragStart) => {
    const { onDragStart } = this.props;
    this.dragState = {
      source: result.source,
      destination: result.source,
      mode: result.mode,
    };
    this.setState({
      draggedItemId: result.draggableId,
    });
    if (onDragStart) {
      onDragStart(result.draggableId);
    }
  };

  onDragUpdate = (update: DragUpdate) => {
    const { onExpand, tree } = this.props;
    const { flattenedTree } = this.state;
    if (!this.dragState) {
      return;
    }

    this.expandTimer.stop();
    if (update.combine) {
      const { draggableId } = update.combine;
      const item: FlattenedItem | undefined = getItemById(flattenedTree, draggableId);
      if (item && this.isExpandable(item)) {
        this.expandTimer.start(() => onExpand(draggableId, item.path));
      }
    }
    this.dragState = {
      ...this.dragState,
      destination: update.destination,
      combine: update.combine,
    };

    const { sourcePosition, destinationPosition } = calculateFinalDropPositions(tree, flattenedTree, this.dragState);

    const moveLegal = canMoveNode(tree, sourcePosition, destinationPosition);

    this.clonedElement?.classList.toggle(TREE_DRAG_STATE_LEGAL, moveLegal);
    this.clonedElement?.classList.toggle(TREE_DRAG_STATE_ILLEGAL, !moveLegal);
  };

  onDropAnimating = () => {
    this.expandTimer.stop();
  };

  onDragEnd = (result: DropResult) => {
    const { onDragEnd, tree } = this.props;
    const { flattenedTree } = this.state;
    this.expandTimer.stop();

    const finalDragState: DragState = {
      ...this.dragState!,
      source: result.source,
      destination: result.destination,
      combine: result.combine,
    };

    this.setState({
      draggedItemId: undefined,
    });

    const { sourcePosition, destinationPosition } = calculateFinalDropPositions(tree, flattenedTree, finalDragState);

    if (canMoveNode(tree, sourcePosition, destinationPosition)) {
      onDragEnd(sourcePosition, destinationPosition);
    } else {
      // Still trigger onDragEnd, but without a destination, so move is canceled.
      onDragEnd(sourcePosition, undefined);
    }

    this.clonedElement?.classList.remove(TREE_DRAG_STATE_LEGAL, TREE_DRAG_STATE_ILLEGAL);

    this.dragState = undefined;
  };

  getDraggedElement = (): HTMLElement | undefined => {
    const draggedItemId = this.state.draggedItemId;

    if (!draggedItemId) {
      return undefined;
    }

    return this.itemsElement[draggedItemId];
  };

  onPointerMove = () => {
    if (this.dragState) {
      this.dragState = {
        ...this.dragState,
        horizontalLevel: this.getDroppedLevel(),
      };
    }
  };

  calculateEffectivePath = (flatItem: FlattenedItem, snapshot: DraggableStateSnapshot): Path => {
    const { flattenedTree, draggedItemId } = this.state;

    if (
      this.dragState &&
      draggedItemId === flatItem.item.id &&
      (this.dragState.destination || this.dragState.combine)
    ) {
      const { source, destination, combine, horizontalLevel, mode } = this.dragState;
      // We only update the path when it's dragged by keyboard or drop is animated
      if (mode === 'SNAP' || snapshot.isDropAnimating) {
        if (destination) {
          // Between two items
          return getDestinationPath(flattenedTree, source.index, destination.index, horizontalLevel);
        }
        if (combine) {
          // Hover on other item while dragging
          return getDestinationPath(
            flattenedTree,
            source.index,
            getIndexById(flattenedTree, combine.draggableId),
            horizontalLevel,
          );
        }
      }
    }
    return flatItem.path;
  };

  isExpandable = (item: FlattenedItem): boolean => !!item.item.hasChildren && !item.item.isExpanded;

  getDroppedLevel = (): number | undefined => {
    const { offsetPerLevel } = this.props;
    // const { draggedItemId } = this.state;

    if (!this.dragState || !this.containerElement) {
      return undefined;
    }

    const containerLeft = getBox(this.containerElement).contentBox.left;
    // const itemElement = this.itemsElement[draggedItemId!];
    const itemElement = this.clonedElement;

    if (itemElement) {
      const currentLeft: number = getBox(itemElement).contentBox.left;
      const relativeLeft: number = Math.max(currentLeft - containerLeft, 0);
      return Math.floor((relativeLeft + offsetPerLevel / 2) / offsetPerLevel) + 1;
    }

    return undefined;
  };

  patchDroppableProvided = (provided: DroppableProvided): DroppableProvided => {
    return {
      ...provided,
      innerRef: (el: HTMLElement) => {
        this.containerElement = el;
        provided.innerRef(el);
      },
    };
  };

  setItemRef = (itemId: ItemId, el: HTMLElement | null) => {
    if (!!el) {
      this.itemsElement[itemId] = el;
    }
  };

  renderItem = ({ data, index, style }: ListChildComponentProps & { data: FlattenedItem }): ReactElement | null => {
    const { isDragEnabled, renderItem, onExpand, onCollapse, offsetPerLevel } = this.props;

    const flatItem = data[index];

    if (!flatItem) {
      return null;
    }

    return (
      <Draggable
        key={flatItem.item.id}
        draggableId={flatItem.item.id.toString()}
        index={index}
        isDragDisabled={!isDragEnabled}
      >
        {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => {
          const currentPath: Path = this.calculateEffectivePath(flatItem, snapshot);

          if (snapshot.isDropAnimating) {
            this.onDropAnimating();
          }

          return (
            <TreeItem
              key={flatItem.item.id}
              item={flatItem.item}
              path={currentPath}
              onExpand={onExpand}
              onCollapse={onCollapse}
              renderItem={renderItem}
              provided={provided}
              snapshot={snapshot}
              itemRef={this.setItemRef}
              offsetPerLevel={offsetPerLevel}
              style={style}
            />
          );
        }}
      </Draggable>
    );
  };

  render() {
    const { isNestingEnabled } = this.props;
    const { flattenedTree } = this.state;

    return (
      <AutoSizer>
        {({ width, height }) => (
          <DragDropContext onDragStart={this.onDragStart} onDragEnd={this.onDragEnd} onDragUpdate={this.onDragUpdate}>
            <Droppable
              droppableId="tree"
              isCombineEnabled={isNestingEnabled}
              direction="vertical"
              ignoreContainerClipping
              mode="virtual"
              renderClone={(provided: DraggableProvided, snapshot: DraggableStateSnapshot, rubric: DraggableRubric) => {
                const flatItem = getItemById(this.state.flattenedTree, rubric.draggableId);

                if (!flatItem) {
                  throw new Error(`Could not find item with ID ${rubric.draggableId} in flattenedTree.`);
                }

                const { onExpand, onCollapse, renderItem, offsetPerLevel } = this.props;

                return (
                  <TreeItem
                    key={flatItem.item.id}
                    item={flatItem.item}
                    path={flatItem.path}
                    onExpand={onExpand}
                    onCollapse={onCollapse}
                    renderItem={renderItem}
                    provided={provided}
                    snapshot={snapshot}
                    itemRef={(id, el) => {
                      this.clonedElement = el;
                    }}
                    offsetPerLevel={offsetPerLevel}
                  />
                );
              }}
            >
              {(provided: DroppableProvided, snapshot: DroppableStateSnapshot) => {
                const itemCount = snapshot.isUsingPlaceholder ? flattenedTree.length + 1 : flattenedTree.length;

                const finalProvided: DroppableProvided = this.patchDroppableProvided(provided);

                return (
                  <div onTouchMove={this.onPointerMove} onMouseMove={this.onPointerMove}>
                    <List
                      width={width}
                      height={height}
                      itemCount={itemCount}
                      itemSize={20}
                      itemData={flattenedTree}
                      style={{ pointerEvents: 'auto' }}
                      outerRef={finalProvided.innerRef}
                      {...finalProvided.droppableProps}
                    >
                      {this.renderItem}
                    </List>
                  </div>
                );
              }}
            </Droppable>
          </DragDropContext>
        )}
      </AutoSizer>
    );
  }
}
