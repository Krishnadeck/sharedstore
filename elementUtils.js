// Element utilities for finding and updating elements by ID across different diagram structures

/**
 * Find element by ID in node data, supporting various diagram structures
 * @param {Object} nodeData - The node data object
 * @param {string} elementId - The unique element ID to find
 * @returns {Object|null} - The found element or null
 */
export const findElementById = (nodeData, elementId) => {
    if (!nodeData || !elementId) return null;

    // Try different possible paths for various diagram structures
    const searchPaths = [
        // Linear diagrams: nodeData.elements[]
        () => nodeData.elements?.find((el) => el.id === elementId),

        // Grouped diagrams: nodeData.group.elements[]
        () => nodeData.group?.elements?.find((el) => el.id === elementId),

        // Container diagrams: nodeData.container.items[]
        () => nodeData.container?.items?.find((el) => el.id === elementId),

        // Nested group structures: nodeData.groups[].elements[]
        () => {
            if (nodeData.groups) {
                for (const group of nodeData.groups) {
                    const found = group.elements?.find((el) => el.id === elementId);
                    if (found) return found;
                }
            }
            return null;
        },

        // Deep search in any structure
        () => {
            const deepSearch = (obj) => {
                if (!obj || typeof obj !== "object") return null;

                // Check if this object is the element we're looking for
                if (obj.id === elementId) return obj;

                // Search in arrays
                if (Array.isArray(obj)) {
                    for (const item of obj) {
                        const found = deepSearch(item);
                        if (found) return found;
                    }
                }

                // Search in object properties
                for (const key in obj) {
                    const found = deepSearch(obj[key]);
                    if (found) return found;
                }

                return null;
            };

            return deepSearch(nodeData);
        },
    ];

    // Try each path until we find the element
    for (const searchPath of searchPaths) {
        const element = searchPath();
        if (element) {
            return element;
        }
    }

    return null;
};

/**
 * Get the path to an element in node data for updating purposes
 * @param {Object} nodeData - The node data object
 * @param {string} elementId - The unique element ID
 * @returns {Array|null} - Array representing the path to the element or null
 */
export const getElementPath = (nodeData, elementId) => {
    if (!nodeData || !elementId) return null;

    const findPath = (obj, targetId, currentPath = []) => {
        if (!obj || typeof obj !== "object") return null;

        // Check if this object is the element
        if (obj.id === targetId) return currentPath;

        // Search in arrays
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const found = findPath(obj[i], targetId, [...currentPath, i]);
                if (found) return found;
            }
        }

        // Search in object properties
        for (const key in obj) {
            const found = findPath(obj[key], targetId, [...currentPath, key]);
            if (found) return found;
        }

        return null;
    };

    return findPath(nodeData, elementId);
};

/**
 * Update an element's property in node data using its path
 * @param {Object} nodeData - The node data object
 * @param {Array} elementPath - Path to the element
 * @param {string} property - Property name to update
 * @param {any} value - New value for the property
 * @returns {Object} - Updated node data
 */
export const updateElementInNode = (nodeData, elementPath, property, value) => {
    if (!nodeData || !elementPath || !property) {
        throw new Error("Invalid parameters for element update");
    }

    const updatedNodeData = { ...nodeData };
    let current = updatedNodeData;

    // Navigate to the parent of the element
    for (let i = 0; i < elementPath.length - 1; i++) {
        current = current[elementPath[i]];
    }

    // Update the element
    const elementIndex = elementPath[elementPath.length - 1];
    current[elementIndex] = {
        ...current[elementIndex],
        properties: {
            ...current[elementIndex].properties,
            [property]: value,
        },
    };

    return updatedNodeData;
};

/**
 * Find which slide and node contains a specific element
 * @param {Array} slides - Array of slides
 * @param {string} elementId - The element ID to find
 * @returns {Object|null} - Object with slide and node, or null if not found
 */
export const findElementInSlides = (slides, elementId) => {
    if (!slides || !elementId) return null;

    for (const slide of slides) {
        for (const node of slide.nodes || []) {
            const element = findElementById(node.data, elementId);
            if (element) {
                return { slide, node, element };
            }
        }
    }

    return null;
};

/**
 * Create a selector function for tracking element property changes
 * @param {string} elementId - The element ID to track
 * @param {string} property - The property to track
 * @returns {Function} - Selector function for the shared state
 */
export const createElementPropertySelector = (elementId, property) => {
    return (state) => {
        const result = findElementInSlides(state.slides, elementId);
        return result?.element?.properties?.[property];
    };
};
