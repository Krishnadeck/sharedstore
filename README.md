# shared-state

Minimal framework-agnostic state manager, event bus, and diagram registry
for coordinating the Editor (host) and Diagrams (library) projects.

## Features

-   **State Management**: Centralized state with selective subscriptions
-   **Event Bus**: Publish/subscribe event system
-   **Diagram Registry**: Track active diagrams and their capabilities
-   **Element Updates**: Universal element property updates with completion detection
-   **Cross-Project Coordination**: Singleton pattern ensures single instance across bundles

## API Overview

### State Management

-   `getState()` - Get current state snapshot
-   `setState(partial|fn)` - Update state
-   `subscribe(selector, listener, { equals? })` → unsubscribe - Subscribe to state changes

### Dispatch Actions

-   `dispatch(action)` - Dispatch actions to update state
-   **Actions**:
    -   `SET_SLIDES`, `SET_ACTIVE_SLIDE`, `UPDATE_SLIDE_DATA`
    -   `SET_BASE_FLOATER_CONFIG`, `SET_INLINE_FLOATER_CONFIG`
    -   `REGISTER_DIAGRAM`, `UNREGISTER_DIAGRAM`, `UPDATE_CAPABILITIES`
    -   `SET_SELECTED_NODE`, `UPDATE_ELEMENT_PROPERTY`, `DIAGRAM_COMMAND`

### Element Updates (New in v0.2.0)

-   `dispatchWithElementUpdate(elementId, property, value, timeout?)` → Promise
    -   Updates element properties by ID across any diagram structure
    -   Returns promise that resolves when update is complete
    -   Supports timeout for error handling
    -   Universal element finding (works with linear, grouped, container diagrams)

### Events

-   `on(event, handler)`, `off(event, handler)`, `emit(event, payload)`
-   **Emitted Events**:
    -   `slidesChanged`, `activeSlideChanged`, `slideUpdated`
    -   `baseFloaterConfigChanged`, `inlineFloaterConfigChanged`
    -   `diagramRegistered`, `diagramUnregistered`, `capabilitiesUpdated`
    -   `nodeSelected`, `elementPropertyUpdated`, `diagramCommand:<diagramId>`

### Registry

-   `registerDiagram(entry)` - Register a diagram instance
-   `updateCapabilities(diagramId, capabilities)` - Update diagram capabilities
-   `unregisterDiagram(diagramId)` - Remove diagram from registry
-   `getDiagram(diagramId)`, `getAllDiagrams()` - Query registry

### Selectors

-   `selectors.getActiveSlide(state?)` - Get active slide object
-   `selectors.getActiveDiagramEntry(state?)` - Get active diagram registry entry

## Element Utilities

The `elementUtils.js` module provides universal element operations:

-   `findElementById(nodeData, elementId)` - Find element by ID in any structure
-   `getElementPath(nodeData, elementId)` - Get path to element for updates
-   `updateElementInNode(nodeData, elementPath, property, value)` - Update element property
-   `findElementInSlides(slides, elementId)` - Find element across all slides
-   `createElementPropertySelector(elementId, property)` - Create state selector for tracking

## Usage Example

```javascript
import AppStore from "shared-state";

// Update element property with completion detection
try {
    const result = await AppStore.dispatchWithElementUpdate("element-123", "visible", false);
    console.log("✅ Update completed:", result);
} catch (error) {
    console.error("❌ Update failed:", error);
}

// Subscribe to element property changes
AppStore.subscribe(
    (state) => state.selectedNode,
    (selectedNode) => {
        console.log("Selected node changed:", selectedNode);
    }
);
```

## Architecture

Singleton guarantee via `globalThis.__shared_state_singleton__` ensures single instance across different bundles and projects.

**Version**: 0.2.0
