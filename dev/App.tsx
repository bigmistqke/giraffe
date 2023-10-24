import { For, Index, Show, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'

import { Anchor, Edge, Graph, Handle, Html, Node } from '../src/giraffe'
import type { Vector } from '../src/types'
import { randomFromObject } from '../src/utils/randomFromObject'

type Nodes = Record<string, { position: Vector; handles: string[] }>

const createNodes = (amount = 100) => {
  return Object.fromEntries(
    new Array(amount).fill('').map((_, i) => [
      i.toString(),
      {
        position: {
          x: Math.random() * 8000,
          y: Math.random() * 8000,
        },
        inputs: new Array(5).fill('').map((_, index) => index.toString()),
        handles: new Array(5).fill('').map((_, index) => index.toString()),
      },
    ]),
  )
}

const createEdges = (nodes: Nodes, amount = 50) => {
  return new Array(amount).fill('').map((_, i) => {
    const getHandle = () => {
      const [nodeId, node] = randomFromObject(nodes)
      const [handleId] = randomFromObject(node.handles)
      return {
        nodeId,
        handleId,
      }
    }
    return {
      start: getHandle(),
      end: getHandle(),
    }
  })
}

const Step = (props: { start: Vector; end: Vector }) => {
  const middle = () => ({
    x: props.start.x - (props.start.x - props.end.x) / 2,
    y: props.start.y - (props.start.y - props.end.y) / 2,
  })
  const d = () => {
    const start = props.start
    const end = props.end

    return `M ${start.x} ${start.y} L ${start.x} ${middle().y} ${end.x} ${middle().y} ${end.x} ${
      end.y
    }`
  }
  return (
    <>
      <path stroke="black" fill="transparent" d={d()} />
      <Html.Portal>
        <div
          style={{ position: 'absolute', transform: `translate(${middle().x}px, ${middle().y}px)` }}
        >
          hallo
        </div>
      </Html.Portal>
    </>
  )
}

export function App() {
  const [nodes, setNodes] = createStore<Nodes>(createNodes(250))

  type Handle = { handleId: string; nodeId: string }
  type Edge = { start: Handle; end: Handle }
  const [edges, setEdges] = createStore<Edge[]>(createEdges(nodes, 120))

  const [temporaryEdges, setTemporaryEdges] = createSignal<{
    start: Vector | Handle
    end: Vector | Handle
  }>()

  const validateDrop = (start: Handle, end: Handle) => {
    if (start.nodeId === end.nodeId) return false
    if (start.handleId === 'output' && end.handleId !== 'output') return true
    if (start.handleId !== 'output' && end.handleId === 'output') return true
    return false
  }

  const onDragHandle = (handle: Handle, end: Vector, connectingHandle?: Handle) =>
    connectingHandle && validateDrop(handle, connectingHandle)
      ? setTemporaryEdges({
          start: handle,
          end: connectingHandle,
        })
      : setTemporaryEdges({
          start: handle,
          end,
        })

  const onDrop = (start: Handle, end: Handle) =>
    validateDrop(start, end) && setEdges(edges => [...edges, { start, end: end }])

  return (
    <Graph style={{ height: '100vh', width: '100vw' }}>
      <Html.Destination>
        <For each={edges}>
          {edge => (
            <Edge start={edge.start} end={edge.end}>
              {(start, end) => <Step start={start} end={end} />}
            </Edge>
          )}
        </For>
      </Html.Destination>
      <Html>
        <For each={Object.entries(nodes)}>
          {([nodeId, node]) => (
            <Node
              position={node.position}
              id={nodeId}
              onDrag={position => setNodes(nodeId, { position })}
              style={{
                background: 'blue',
                color: 'black',
              }}
            >
              <div style={{ display: 'flex', gap: '5px' }}>
                <Index each={node.handles}>
                  {handleId => (
                    <Handle
                      onDrag={(position, hoveringHandle) =>
                        onDragHandle({ nodeId, handleId: handleId() }, position, hoveringHandle)
                      }
                      onDragEnd={() => setTemporaryEdges(undefined)}
                      onDrop={handle => onDrop(handle, { nodeId, handleId: handleId() })}
                      id={handleId()}
                    >
                      <Anchor style={{ top: '0px', left: '50%' }} />
                      {handleId()}
                    </Handle>
                  )}
                </Index>
              </div>
              hallo
              <Handle
                onDrag={(position, hoveringHandle) =>
                  onDragHandle({ nodeId, handleId: 'output' }, position, hoveringHandle)
                }
                onDragEnd={() => setTemporaryEdges(undefined)}
                onDrop={handle => onDrop(handle, { nodeId, handleId: 'output' })}
                id="output"
              >
                <Anchor style={{ bottom: '0px', left: '50%' }} />
                output
              </Handle>
            </Node>
          )}
        </For>
      </Html>
      <Show when={temporaryEdges()}>
        {edge => (
          <Edge start={edge().start} end={edge().end}>
            {(start, end) => <Step start={start} end={end} />}
          </Edge>
        )}
      </Show>
    </Graph>
  )
}
