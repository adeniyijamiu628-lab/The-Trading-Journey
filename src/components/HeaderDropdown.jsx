// src/components/HeaderDropdown.jsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Props:
 * - id: unique string key for this header (used to manage open state)
 * - label: header label text
 * - arrowAlwaysVisible: boolean (true in our use)
 * - isOpen: boolean (openDropdownKey === id)
 * - onHoverEnter: () => set open key
 * - onHoverLeave: () => clear open key
 * - onSortAsc: () => {}
 * - onSortDesc: () => {}
 * - filterOptions: array of { key, label } or null
 * - onFilterSelect: (value) => {}
 * - onReset: () => {}
 */
const HeaderDropdown = ({
  id,
  label,
  arrowAlwaysVisible = true,
  isOpen,
  onHoverEnter,
  onHoverLeave,
  onSortAsc,
  onSortDesc,
  filterOptions = null,
  onFilterSelect = null,
  onReset = null,
  compact = false, // if you want smaller header text
}) => {
  return (
    <div
      className={`relative group inline-flex items-center ${compact ? "text-sm" : ""}`}
      onMouseEnter={() => onHoverEnter && onHoverEnter(id)}
      onMouseLeave={() => onHoverLeave && onHoverLeave(null)}
    >
      <div className="flex items-center gap-2 px-2 py-1 select-none">
        <span className="whitespace-nowrap">{label}</span>
        {arrowAlwaysVisible && (
          <svg
            className="h-4 w-4 text-gray-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" />
          </svg>
        )}
      </div>

      {/* Floating dropdown — appears slightly offset with shadow */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 6, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 mt-2 w-48 z-50"
          >
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-2 ring-1 ring-black ring-opacity-5">
              <div className="px-3 py-1">
                <button
                  onClick={(e) => { e.preventDefault(); onSortAsc && onSortAsc(); }}
                  className="w-full text-left text-sm text-gray-200 px-2 py-1 rounded hover:bg-gray-700 transition"
                >
                  ↑ Sort Ascending
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); onSortDesc && onSortDesc(); }}
                  className="w-full text-left text-sm text-gray-200 px-2 py-1 rounded hover:bg-gray-700 transition"
                >
                  ↓ Sort Descending
                </button>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-700 my-1" />

              {/* Filter area (if any) */}
              {filterOptions ? (
                <div className="px-2 py-1">
                  <div className="text-xs text-gray-400 px-2 pb-1">Filter</div>
                  <div className="max-h-36 overflow-auto">
                    {filterOptions.map((opt) => (
                      <button
                        key={opt.key ?? opt}
                        onClick={(e) => { e.preventDefault(); onFilterSelect && onFilterSelect(opt.key ?? opt); }}
                        className="w-full text-left text-sm text-gray-200 px-2 py-1 rounded hover:bg-gray-700 transition"
                      >
                        {opt.label ?? opt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-3 py-2 text-xs text-gray-400">No filters</div>
              )}

              <div className="border-t border-gray-700 mt-1" />
              <div className="px-3 py-2">
                <button
                  onClick={(e) => { e.preventDefault(); onReset && onReset(); }}
                  className="w-full text-left text-sm text-gray-200 px-2 py-1 rounded hover:bg-gray-700 transition"
                >
                  Reset Filter
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HeaderDropdown;
