import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GraphQueryPanel from '../GraphQueryPanel'
import { apiFetch, parseJsonSafe } from '../../utils/api'

vi.mock('../../utils/api', () => ({
  apiFetch: vi.fn(),
  parseJsonSafe: vi.fn(),
}))

vi.mock('../GraphView', () => ({
  default: ({ nodes = [], edges = [], startNodeId = '', pathNodeIds = [], highlightedEdgeKeys = [], onNodeSelect }) => (
    <div data-testid="graph-view">
      <div>{`graph nodes ${nodes.length}`}</div>
      <div>{`graph edges ${edges.length}`}</div>
      <div>{`start ${startNodeId || '-'}`}</div>
      <div>{`path nodes ${pathNodeIds.length}`}</div>
      <div>{`highlighted edges ${highlightedEdgeKeys.length}`}</div>
      <button type="button" onClick={() => onNodeSelect?.(nodes[0]?.id || nodes[0]?.globalId || '')}>
        select graph node
      </button>
    </div>
  ),
}))

function response(payload, ok = true) {
  return { ok, __payload: payload }
}

function renderPanel() {
  return render(
    <GraphQueryPanel
      isOpen
      onClose={() => {}}
      jobId="job-1"
      selectedId="eq-1"
      onSelectResult={vi.fn()}
      onSelectResultBatch={vi.fn()}
      focusToken={null}
      zIndex={1}
    />
  )
}

async function openTraversalMode() {
  fireEvent.click(screen.getByRole('button', { name: 'Traversal Explorer' }))
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Load 1-Hop' })).toBeEnabled()
  })
}

function buildRoutes(overrides = {}) {
  return {
    '/api/graph/job-1/stats': response({
      node_count: 5,
      edge_count: 4,
      node_types: { IfcUnitaryEquipment: 1, IfcSpace: 1 },
      edge_types: { CONTAINED_IN: 2, IN_SYSTEM: 2 },
      storeys: ['L2'],
      materials: [],
    }),
    '/api/graph/job-1/neighbors/eq-1': response({
      nodes: [
        { id: 'eq-1', name: 'Air Handler', graphRole: 'equipment', storey: 'L2' },
        { id: 'sys-1', name: 'Supply System', graphRole: 'system' },
        { id: 'space-1', name: 'Room 201', graphRole: 'space', storey: 'L2' },
      ],
      edges: [
        { source: 'eq-1', target: 'sys-1', type: 'IN_SYSTEM' },
        { source: 'eq-1', target: 'space-1', type: 'CONTAINED_IN' },
      ],
      total: 3,
      center: 'eq-1',
    }),
    '/api/graph/job-1/neighbors/sys-1': response({
      nodes: [
        { id: 'sys-1', name: 'Supply System', graphRole: 'system' },
        { id: 'eq-1', name: 'Air Handler', graphRole: 'equipment', storey: 'L2' },
        { id: 'term-1', name: 'Diffuser 1', graphRole: 'terminal', storey: 'L2' },
      ],
      edges: [
        { source: 'eq-1', target: 'sys-1', type: 'IN_SYSTEM' },
        { source: 'term-1', target: 'sys-1', type: 'IN_SYSTEM' },
      ],
      total: 3,
      center: 'sys-1',
    }),
    '/api/graph/job-1/neighbors/space-1': response({
      nodes: [
        { id: 'space-1', name: 'Room 201', graphRole: 'space', storey: 'L2' },
        { id: 'eq-1', name: 'Air Handler', graphRole: 'equipment', storey: 'L2' },
        { id: 'storey-1', name: 'Level L2', graphRole: 'storey', storey: 'L2' },
      ],
      edges: [
        { source: 'eq-1', target: 'space-1', type: 'CONTAINED_IN' },
        { source: 'space-1', target: 'storey-1', type: 'CONTAINED_IN' },
      ],
      total: 3,
      center: 'space-1',
    }),
    '/api/graph/job-1/path/eq-1/term-1': response({
      nodes: [
        { id: 'eq-1', name: 'Air Handler', graphRole: 'equipment', storey: 'L2' },
        { id: 'sys-1', name: 'Supply System', graphRole: 'system' },
        { id: 'term-1', name: 'Diffuser 1', graphRole: 'terminal', storey: 'L2' },
      ],
      edges: [
        { source: 'eq-1', target: 'sys-1', type: 'IN_SYSTEM' },
        { source: 'term-1', target: 'sys-1', type: 'IN_SYSTEM' },
      ],
      total: 3,
      hops: 2,
    }),
    ...overrides,
  }
}

function mockRoutes(routeTable) {
  apiFetch.mockImplementation(async (path) => {
    const route = routeTable[path]
    if (!route) {
      throw new Error(`Unexpected route: ${path}`)
    }
    if (Array.isArray(route)) {
      if (!route.length) throw new Error(`No responses left for route: ${path}`)
      return route.shift()
    }
    return route
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  parseJsonSafe.mockImplementation(async (responseValue) => responseValue?.__payload ?? null)
})

test('loads the first traversal hop from the selected node', async () => {
  mockRoutes(buildRoutes())
  renderPanel()

  await openTraversalMode()
  fireEvent.click(screen.getByRole('button', { name: 'Load 1-Hop' }))

  await waitFor(() => {
    expect(screen.getByText('Hop 1')).toBeInTheDocument()
  })

  expect(screen.getByText('Relationships this hop: CONTAINED_IN, IN_SYSTEM')).toBeInTheDocument()
  expect(screen.getByText('Air Handler -> Supply System')).toBeInTheDocument()
  expect(screen.getByText('Air Handler -> Room 201')).toBeInTheDocument()
  expect(screen.getByText('graph nodes 3')).toBeInTheDocument()
})

test('expands from the current frontier without duplicating previously visited nodes', async () => {
  mockRoutes(buildRoutes())
  renderPanel()

  await openTraversalMode()
  fireEvent.click(screen.getByRole('button', { name: 'Load 1-Hop' }))

  await waitFor(() => {
    expect(screen.getByText('Hop 1')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByRole('button', { name: 'Next Hop' }))

  await waitFor(() => {
    expect(screen.getByText('Hop 2')).toBeInTheDocument()
  })

  expect(screen.getByText('Supply System -> Diffuser 1')).toBeInTheDocument()
  expect(screen.getByText('Room 201 -> Level L2')).toBeInTheDocument()
  expect(screen.getByText('graph nodes 5')).toBeInTheDocument()
  expect(screen.getAllByText('Seen').length).toBeGreaterThan(0)
})

test('applies the relationship filter during hop expansion', async () => {
  mockRoutes(buildRoutes())
  renderPanel()

  await openTraversalMode()
  fireEvent.change(screen.getByLabelText('Edge Filter'), { target: { value: 'IN_SYSTEM' } })
  fireEvent.click(screen.getByRole('button', { name: 'Load 1-Hop' }))

  await waitFor(() => {
    expect(screen.getByText('Hop 1')).toBeInTheDocument()
  })

  expect(screen.getByText('Relationships this hop: IN_SYSTEM')).toBeInTheDocument()
  expect(screen.getByText('Air Handler -> Supply System')).toBeInTheDocument()
  expect(screen.queryByText('Air Handler -> Room 201')).not.toBeInTheDocument()
  expect(screen.getByText('graph nodes 2')).toBeInTheDocument()
})

test('renders the shortest path and clears it on reset', async () => {
  mockRoutes(buildRoutes())
  renderPanel()

  await openTraversalMode()
  fireEvent.click(screen.getByRole('button', { name: 'Load 1-Hop' }))

  await waitFor(() => {
    expect(screen.getByText('Hop 1')).toBeInTheDocument()
  })

  fireEvent.change(screen.getByLabelText('Target Node'), { target: { value: 'term-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Find Path' }))

  await waitFor(() => {
    expect(screen.getByText('2 hops from eq-1 to term-1')).toBeInTheDocument()
  })

  expect(screen.getByText('path nodes 3')).toBeInTheDocument()
  expect(screen.getByText('Diffuser 1')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Reset Traversal' }))

  await waitFor(() => {
    expect(screen.queryByText('2 hops from eq-1 to term-1')).not.toBeInTheDocument()
  })

  expect(screen.getByText('Load 1-Hop to inspect traversal batches.')).toBeInTheDocument()
})
