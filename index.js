// Minimal shared-state singleton: store, event bus, diagram registry.
// No framework dependencies; ESM-compatible. Avoids duplicate instances via globalThis.
// Each function below includes a concise self-explanatory comment about its role.

// Import element utilities
import { findElementById, getElementPath, updateElementInNode, findElementInSlides, createElementPropertySelector } from "./elementUtils.js";

// Global key used to pin the singleton on globalThis to avoid duplicate instances across bundles
const SHARED_KEY = "__shared_state_singleton__";

// Creates a tiny publish/subscribe event bus with on/off/emit
function createEventBus() {
    const listeners = new Map();
    return {
        // Subscribe to an event and get an unsubscribe function
        on(event, handler) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(handler);
            return () => this.off(event, handler);
        },
        // Remove a previously subscribed handler for an event
        off(event, handler) {
            const set = listeners.get(event);
            if (set) set.delete(handler);
        },
        // Notify all subscribers of an event (errors are isolated per handler)
        emit(event, payload) {
            const set = listeners.get(event);
            if (!set || set.size === 0) return;
            // Copy to protect against mutations during emit
            Array.from(set).forEach((fn) => {
                try {
                    fn(payload);
                } catch (_) {}
            });
        },
    };
}

// Shallow equality helper to decide whether a selected slice changed
function shallowEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
        if (!Object.prototype.hasOwnProperty.call(b, k) || !Object.is(a[k], b[k])) return false;
    }
    return true;
}

// Creates a minimal observable store with get/set and selective subscriptions
function createStore(initialState = {}) {
    let state = initialState;
    const subs = new Set();

    // Read the current state snapshot
    function getState() {
        return state;
    }

    // Replace or merge state and notify subscribers whose selected slice changed
    function setState(partial) {
        const next = typeof partial === "function" ? partial(state) : { ...state, ...partial };
        state = next;
        // Notify subscribers; each has selector/equality
        subs.forEach((sub) => {
            try {
                const nextSlice = sub.selector ? sub.selector(state) : state;
                const changed = sub.equals ? !sub.equals(sub.lastSlice, nextSlice) : !shallowEqual(sub.lastSlice, nextSlice);
                if (changed) {
                    sub.lastSlice = nextSlice;
                    sub.listener(nextSlice, state);
                }
            } catch (_) {}
        });
    }

    // Subscribe to a derived slice of state with an optional equality function
    function subscribe(selector, listener, options = {}) {
        const sel = typeof selector === "function" ? selector : (s) => s;
        const equals = options.equals || shallowEqual;
        const entry = { selector: sel, listener, equals, lastSlice: sel(state) };
        subs.add(entry);
        return () => subs.delete(entry);
    }

    return { getState, setState, subscribe };
}

// Registry of mounted diagrams and their mutable capabilities
function createRegistry() {
    const entries = new Map(); // diagramId -> { diagramId, type, capabilities, status, meta }
    return {
        // Add or update a diagram entry in the registry
        register(entry) {
            if (!entry || !entry.diagramId) return;
            const current = entries.get(entry.diagramId) || {};
            entries.set(entry.diagramId, { ...current, ...entry });
        },
        // Replace capabilities for a specific diagram
        updateCapabilities(diagramId, capabilities) {
            const entry = entries.get(diagramId);
            if (!entry) return;
            entry.capabilities = capabilities;
            entries.set(diagramId, entry);
        },
        // Remove a diagram from the registry (e.g., on unmount)
        unregister(diagramId) {
            entries.delete(diagramId);
        },
        // Fetch a single diagram entry
        get(diagramId) {
            return entries.get(diagramId) || null;
        },
        // Fetch all diagram entries
        getAll() {
            return Array.from(entries.values());
        },
    };
}

// Central dispatcher handling app/editor actions, registry changes, and diagram commands
function createDispatcher(store, bus, registry) {
    return function dispatch(action) {
        if (!action || typeof action.type !== "string") return;
        switch (action.type) {
            // Editor-side state mutations
            case "SET_SLIDES":
                store.setState({ slides: action.slides || [] });
                bus.emit("slidesChanged", store.getState().slides);
                break;
            case "SET_ACTIVE_SLIDE":
                store.setState({ activeSlideId: action.slideId || null });
                bus.emit("activeSlideChanged", store.getState().activeSlideId);
                break;
            case "UPDATE_SLIDE_DATA": {
                const { slideId, data } = action;
                const { slides = [] } = store.getState();
                const updated = slides.map((s) => (s.id === slideId ? { ...s, ...data } : s));
                store.setState({ slides: updated });
                bus.emit("slideUpdated", { slideId, data });
                break;
            }

            // UI config
            case "SET_BASE_FLOATER_CONFIG":
                store.setState({ ui: { ...(store.getState().ui || {}), baseFloaterConfig: action.config } });
                bus.emit("baseFloaterConfigChanged", action.config);
                break;
            case "SET_INLINE_FLOATER_CONFIG":
                store.setState({ ui: { ...(store.getState().ui || {}), inlineFloaterConfig: action.config } });
                bus.emit("inlineFloaterConfigChanged", action.config);
                break;

            // Diagram registration
            case "REGISTER_DIAGRAM": {
                registry.register(action.entry);
                bus.emit("diagramRegistered", action.entry);
                break;
            }
            case "UNREGISTER_DIAGRAM": {
                registry.unregister(action.diagramId);
                bus.emit("diagramUnregistered", action.diagramId);
                break;
            }
            case "UPDATE_CAPABILITIES": {
                registry.updateCapabilities(action.diagramId, action.capabilities || []);
                bus.emit("capabilitiesUpdated", { diagramId: action.diagramId, capabilities: action.capabilities || [] });
                break;
            }
            case "SET_SELECTED_NODE": {
                store.setState({
                    ...store.getState(),
                    selectedNode: {
                        nodeId: action.nodeId,
                        diagramId: action.diagramId,
                        nodeData: action.nodeData,
                        selectedElement: action.selectedElement || null,
                    },
                });
                bus.emit("nodeSelected", {
                    nodeId: action.nodeId,
                    diagramId: action.diagramId,
                    selectedElement: action.selectedElement,
                });
                break;
            }
            case "UPDATE_ELEMENT_PROPERTY": {
                const { elementId, property, value } = action;
                const { slides = [] } = store.getState();

                // Find the element in slides
                const result = findElementInSlides(slides, elementId);
                if (!result) {
                    console.error(`Element with ID ${elementId} not found in any slide`);
                    break;
                }

                const { slide, node } = result;

                // Get the path to the element
                const elementPath = getElementPath(node.data, elementId);
                if (!elementPath) {
                    console.error(`Could not determine path for element ${elementId}`);
                    break;
                }

                // Update the element
                const updatedNodeData = updateElementInNode(node.data, elementPath, property, value);
                const updatedNode = { ...node, data: updatedNodeData };

                // Update the slide
                const updatedNodes = slide.nodes.map((n) => (n.id === node.id ? updatedNode : n));
                const updatedSlide = { ...slide, nodes: updatedNodes };

                // Update the slides array
                const updatedSlides = slides.map((s) => (s.id === slide.id ? updatedSlide : s));
                store.setState({ slides: updatedSlides });

                // Emit completion event if callback provided
                if (action._onComplete) {
                    setTimeout(() => action._onComplete(), 0);
                }

                bus.emit("elementPropertyUpdated", { elementId, property, value, slideId: slide.id, nodeId: node.id });
                break;
            }

            // Commands routed to diagrams
            case "DIAGRAM_COMMAND": {
                // Forward via bus; diagrams listen for their id
                bus.emit(`diagramCommand:${action.targetDiagramId}`, action);
                break;
            }

            default:
                // ignore unknown
                break;
        }
    };
}

// Builds the singleton with store, bus, registry, and convenience selectors
function initSingleton() {
    const initial = {
        slides: [],
        slidesObj: {},
        activeSlideId: null,
        ui: { baseFloaterConfig: null, inlineFloaterConfig: null },
        selectedNode: {},
    };
    const store = createStore(initial);
    const bus = createEventBus();
    const registry = createRegistry();
    const dispatch = createDispatcher(store, bus, registry);

    // Helpers & selectors
    // Returns the active slide object based on activeSlideId
    function getActiveSlide(state = store.getState()) {
        const { slides, activeSlideId } = state;
        return slides.find((s) => s.id === activeSlideId) || null;
    }
    // Returns the registry entry for the active slide's diagram
    function getActiveDiagramEntry(state = store.getState()) {
        const slide = getActiveSlide(state);
        if (!slide || !slide.diagramId) return null;
        return registry.get(slide.diagramId);
    }

    return {
        // core
        getState: store.getState,
        setState: store.setState,
        subscribe: store.subscribe,
        updateState: (updater) => {
            const currentState = store.getState();
            const newState = typeof updater === "function" ? updater(currentState) : updater;
            store.setState(newState);
        },
        dispatch,

        // events
        on: bus.on.bind(bus),
        off: bus.off.bind(bus),
        emit: bus.emit.bind(bus),

        // registry
        registerDiagram(entry) {
            dispatch({ type: "REGISTER_DIAGRAM", entry });
        },
        updateCapabilities(diagramId, capabilities) {
            dispatch({ type: "UPDATE_CAPABILITIES", diagramId, capabilities });
        },
        unregisterDiagram(diagramId) {
            dispatch({ type: "UNREGISTER_DIAGRAM", diagramId });
        },
        getDiagram(diagramId) {
            return registry.get(diagramId);
        },
        getAllDiagrams() {
            return registry.getAll();
        },

        // selectors
        selectors: { getActiveSlide, getActiveDiagramEntry },

        // Enhanced element update with completion detection
        dispatchWithElementUpdate(elementId, property, value, timeout = 5000) {
            return new Promise((resolve, reject) => {
                const actionId = Date.now() + Math.random();

                // Set up completion detection
                const selector = createElementPropertySelector(elementId, property);
                const unsubscribe = store.subscribe(selector, (newValue) => {
                    if (newValue === value) {
                        unsubscribe();
                        resolve({
                            success: true,
                            elementId,
                            property,
                            value: newValue,
                            timeElapsed: Date.now() - startTime,
                        });
                    }
                });

                const startTime = Date.now();

                // Dispatch the action
                dispatch({
                    type: "UPDATE_ELEMENT_PROPERTY",
                    elementId,
                    property,
                    value,
                });

                // Timeout
                setTimeout(() => {
                    unsubscribe();
                    reject(new Error(`Element update timeout for ${elementId}`));
                }, timeout);
            });
        },

        // version
        version: "0.1.0",
    };
}

// Ensure single instance across bundles by storing on globalThis
const SharedState = globalThis[SHARED_KEY] || (globalThis[SHARED_KEY] = initSingleton());

// Default export for general use and named export for clarity
export default SharedState;
export const AppStore = SharedState;
