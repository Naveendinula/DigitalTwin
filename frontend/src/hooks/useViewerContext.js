import { createContext, createElement, useContext } from 'react'

const ViewerContext = createContext(null)

export function ViewerProvider({ value, children }) {
  return createElement(ViewerContext.Provider, { value }, children)
}

export function useViewerContext() {
  const context = useContext(ViewerContext)
  if (!context) {
    throw new Error('useViewerContext must be used within a ViewerProvider')
  }
  return context
}
