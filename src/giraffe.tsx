import { createLazyMemo } from '@solid-primitives/memo'
import clsx from 'clsx'
import type { Accessor, ComponentProps, JSX, ParentProps } from 'solid-js'
import {
  Show,
  children,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  splitProps,
  untrack,
  useContext,
} from 'solid-js'
import { createStore } from 'solid-js/store'

import type { Handle as HandleType, Vector } from './types'
import { cursor } from './utils/cursor'
import { vector } from './utils/vector'

import styles from './giraffe.module.css'

/* HTML */

export const Html = function (props: ComponentProps<'foreignObject'>) {
  const [classProp, rest] = splitProps(props, ['class'])
  return (
    <foreignObject class={clsx(styles.foreignObject, classProp)} {...rest}>
      {props.children}
    </foreignObject>
  )
}

const htmlContext = createContext<{
  add: (element: Accessor<JSX.Element>) => void
  remove: (element: Accessor<JSX.Element>) => void
}>()
const useHtmlDestinationContext = () => useContext(htmlContext)

Html.Destination = (props: ComponentProps<typeof Html>) => {
  const [elements, setElements] = createSignal<Accessor<JSX.Element>[]>([])
  const api = {
    add: (element: Accessor<JSX.Element>) => {
      setElements(elements => [...elements, element])
    },
    remove: (element: Accessor<JSX.Element>) => {
      setElements(elements => elements?.filter(e => e !== element))
    },
  }
  return (
    <>
      <htmlContext.Provider value={api}>
        <Html {...props}>{elements() as any as JSX.Element}</Html>
        {props.children}
      </htmlContext.Provider>
    </>
  )
}
Html.Portal = (props: ParentProps) => {
  const htmlDestinationContext = useHtmlDestinationContext()
  const childs = children(() => props.children)

  createEffect(() => {
    if (!htmlDestinationContext) return
    htmlDestinationContext?.add(childs)
  })
  onCleanup(() => htmlDestinationContext?.remove(childs))

  return <></>
}

/* NODE */

const nodeContext = createContext<{
  addHandle: (handleId: string, dom: HTMLElement) => void
  removeHandle: (handleId: string) => void
  id: string
}>()
const useNode = () => useContext(nodeContext)

export const Node = function (
  props: ParentProps<{
    id: string
    position: Vector
    onDrag: (position: Vector) => void
    style: JSX.CSSProperties
  }>,
) {
  const graphContext = useGraph()

  if (!graphContext) throw 'Node should be sibling of Graph'

  const onMouseDown = (e: MouseEvent) => {
    const start = { ...props.position }
    cursor(e, delta => {
      props.onDrag({
        x: start.x - delta.x / graphContext.zoom,
        y: start.y - delta.y / graphContext.zoom,
      })
    })
  }

  const addHandle = (handleId: string, dom: HTMLElement) => {
    let bounds: DOMRect, delta: Vector
    const position = createLazyMemo(() => {
      if (!bounds) {
        bounds = dom.getBoundingClientRect()
        delta = vector.subtract(
          {
            x: bounds.x + bounds.width / 2 - graphContext.pan.x,
            y: bounds.y + bounds.height / 2 - graphContext.pan.y,
          },
          props.position,
        )
      }
      return vector.add(props.position, delta)
    })
    graphContext?.addHandle(props.id, handleId, {
      dom,
      get position() {
        return position()
      },
    })
  }

  const removeHandle = (handleId: string) => graphContext?.removeHandle(props.id, handleId)

  return (
    <nodeContext.Provider
      value={{
        addHandle,
        removeHandle,
        get id() {
          return props.id
        },
      }}
    >
      <div
        style={{
          position: 'absolute',
          transform: `translate(${props.position.x}px, ${props.position.y}px)`,
          ...props.style,
        }}
        onMouseDown={onMouseDown}
      >
        {props.children}
      </div>
    </nodeContext.Provider>
  )
}

/* HANDLE */

const handleIdContext = createContext<string>()
const useHandleId = () => useContext(handleIdContext)

export function Handle(
  props: ParentProps<{
    id: string
    onDrag?: (handle: Vector, hoveringHandle?: HandleType) => void
    onDragStart?: () => void
    onDragEnd?: () => void
    onDrop?: (handle: HandleType) => void
    style?: JSX.CSSProperties
  }>,
) {
  const nodeContext = useNode()
  const handleContext = useCurrentHandleContext()
  let ref: HTMLDivElement

  if (!nodeContext) throw 'Graph.Node.Handle should be sibling of Graph.Node'
  if (!handleContext) throw 'Graph.Node.Handle should be sibling of Graph'

  onMount(() => nodeContext?.addHandle(props.id, ref))

  const onMouseDown = async (e: MouseEvent) => {
    e.stopPropagation()

    const position = {
      x: e.clientX,
      y: e.clientY,
    }

    handleContext.setDraggingHandle({
      handleId: props.id,
      nodeId: nodeContext.id,
    })

    props.onDragStart?.()

    await cursor(e, delta => {
      props.onDrag?.(vector.subtract(position, delta), handleContext.hoveringHandle)
    })

    props.onDragEnd?.()
    handleContext.setDraggingHandle(undefined)
  }

  const onMouseUp = () =>
    handleContext.draggingHandle && props.onDrop && props.onDrop(handleContext.draggingHandle)

  const onMouseMove = () => {
    if (!handleContext.draggingHandle) return
    if (
      handleContext.draggingHandle.handleId === props.id &&
      handleContext.draggingHandle.nodeId === nodeContext.id
    )
      return

    handleContext.setHoveringHandle({
      handleId: props.id,
      nodeId: nodeContext.id,
    })
  }

  const onMouseOut = () => {
    if (
      handleContext.hoveringHandle?.nodeId !== nodeContext?.id ||
      handleContext.hoveringHandle?.handleId !== props.id
    )
      return

    handleContext.setHoveringHandle(undefined)
  }

  return (
    <div
      ref={ref!}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseMove={onMouseMove}
      onMouseOut={onMouseOut}
      style={{
        position: 'relative',
        ...props.style,
      }}
    >
      <handleIdContext.Provider value={props.id}>{props.children}</handleIdContext.Provider>
    </div>
  )
}

/* ANCHOR */

export function Anchor(props: { style: JSX.CSSProperties }) {
  const nodeContext = useNode()
  const handleIdContext = useHandleId()
  let ref: HTMLDivElement

  if (!nodeContext) throw 'Graph.Node.Handle should be sibling of Graph.Node'
  if (!handleIdContext) throw 'Graph.Node.Handle should be sibling of Graph'

  onMount(() => nodeContext?.addHandle(handleIdContext, ref))

  return <div ref={ref!} style={{ ...props.style, position: 'absolute' }} />
}

/* EDGE */

export const Edge = (props: {
  start: { handleId: string; nodeId: string } | Vector
  end: { handleId: string; nodeId: string } | Vector
  children?: (start: Vector, end: Vector) => JSX.Element
}) => {
  const graphContext = useGraph()

  const start = () =>
    graphContext
      ? 'x' in props.start
        ? vector.subtract(
            props.start,
            untrack(() => graphContext.pan),
          )
        : graphContext.sceneGraph[props.start.nodeId]?.[props.start.handleId]?.position
      : undefined
  const end = () =>
    graphContext
      ? 'x' in props.end
        ? vector.subtract(
            props.end,
            untrack(() => graphContext.pan),
          )
        : graphContext?.sceneGraph[props.end.nodeId]?.[props.end.handleId]?.position
      : undefined

  return (
    <Show
      when={start() && end() && props.children}
      fallback={
        <line class={styles.line} x1={start()?.x} y1={start()?.y} x2={end()?.x} y2={end()?.y} />
      }
    >
      {props.children?.(start()!, end()!)}
    </Show>
  )
}

/* GRAPH */

type SceneGraph = Record<string, Record<string, { dom: HTMLElement; position: Vector }>>

const graphContext = createContext<{
  addHandle: (
    nodeId: string,
    handleId: string,
    handle: { dom: HTMLElement; position: Vector },
  ) => void
  removeHandle: (nodeId: string, handleId: string) => void
  sceneGraph: SceneGraph
  pan: Vector
  zoom: number
}>()
const useGraph = () => useContext(graphContext)

const currentHandleContext = createContext<{
  draggingHandle: undefined | HandleType
  setDraggingHandle: (handle: undefined | HandleType) => void
  hoveringHandle: undefined | HandleType
  setHoveringHandle: (handle: undefined | HandleType) => void
}>()
const useCurrentHandleContext = () => useContext(currentHandleContext)

export const getHandlePosition = (nodeId: string, handleId: string) => {
  const graphContext = useGraph()
  console.log('graphContext', graphContext)
  return graphContext?.sceneGraph[nodeId]?.[handleId]?.position
}

export function Graph(props: ParentProps<{ style: JSX.CSSProperties }>) {
  const [sceneGraph, setSceneGraph] = createStore<SceneGraph>({})

  const [draggingHandle, setDraggingHandle] = createSignal<HandleType | undefined>()
  const [hoveringHandle, setHoveringHandle] = createSignal<HandleType | undefined>()

  const [pan, setPan] = createSignal<Vector>({ x: 0, y: 0 })
  const [zoom, setZoom] = createSignal(1)

  const addHandle = (
    nodeId: string,
    handleId: string,
    handle: { dom: HTMLElement; position: Vector },
  ) => {
    setSceneGraph(nodeId, { [handleId]: handle })
  }

  const removeHandle = (nodeId: string, handleId: string) =>
    setSceneGraph(nodeId, handleId, undefined)

  const onMouseDown = (e: MouseEvent) => {
    if (e.currentTarget !== e.target) return
    const start = { ...pan() }
    cursor(e, delta => {
      setPan({
        x: start.x - delta.x,
        y: start.y - delta.y,
      })
    })
  }

  const onWheel = (e: WheelEvent) => {
    const newZoom = zoom() + e.deltaY / 100
    if (newZoom > 2 || newZoom < 0.1) return

    const cursor = vector.multiply(
      {
        x: e.clientX,
        y: e.clientY,
      },
      zoom(),
    )
    const newCursor = vector.multiply(vector.divide(cursor, zoom()), newZoom)

    const newPan = vector.multiply(vector.divide(pan(), zoom()), newZoom)
    const offset = vector.subtract(cursor, newCursor)

    setZoom(newZoom)
    setPan(newPan)
    setPan(vector.add(newPan, vector.divide(offset, zoom())))
  }

  return (
    <graphContext.Provider
      value={{
        addHandle,
        removeHandle,
        sceneGraph,
        get pan() {
          return pan()
        },
        get zoom() {
          return zoom()
        },
      }}
    >
      <currentHandleContext.Provider
        value={{
          get draggingHandle() {
            return draggingHandle()
          },
          setDraggingHandle,
          get hoveringHandle() {
            return hoveringHandle()
          },
          setHoveringHandle,
        }}
      >
        <svg
          style={{
            width: '100%',
            height: '100%',

            ...props.style,
          }}
          class={styles.svg}
          onMouseDown={onMouseDown}
          onWheel={onWheel}
          overflow="visible"
        >
          <g
            style={{
              transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})`,
              'will-change': 'transform',
              'pointer-events': 'none',
            }}
          >
            {props.children}
          </g>
        </svg>
      </currentHandleContext.Provider>
    </graphContext.Provider>
  )
}
