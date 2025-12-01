import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { WORLD_GEO_JSON_URL } from '../utils/geo';
import { Port, RouteResult } from '../types';
import { Plus, Minus, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';

interface WorldMapProps {
    ports: Port[];
    selectedRoute: RouteResult | null;
    selectedPort?: Port | null;
    onPortClick?: (port: Port) => void;
    onMapClick?: () => void;
}

const WorldMap: React.FC<WorldMapProps> = ({ ports, selectedRoute, selectedPort, onPortClick, onMapClick }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const mapGroupRef = useRef<SVGGElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const [geoData, setGeoData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryTrigger, setRetryTrigger] = useState(0);

    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [zoomK, setZoomK] = useState(1);
    const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

    const fetchMapData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Longer timeout for mobile networks
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const res = await fetch(WORLD_GEO_JSON_URL, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) {
                throw new Error(`Failed to load map data (${res.status})`);
            }
            const data = await res.json();
            setGeoData(data);
        } catch (err: any) {
            console.error("Map Data Error:", err);
            setError("Unable to load the world map. Check your connection.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMapData();
    }, [fetchMapData, retryTrigger]);

    // Robust dimension detection
    useEffect(() => {
        if (!wrapperRef.current) return;

        // Initial check
        const rect = wrapperRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            setDimensions({ width: rect.width, height: rect.height });
        }

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Use contentRect, but fallback to getBoundingClientRect if needed
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setDimensions({ width, height });
                } else {
                    // Fallback for some mobile browsers returning 0 contentRect initially
                    const rect = entry.target.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        setDimensions({ width: rect.width, height: rect.height });
                    }
                }
            }
        });
        resizeObserver.observe(wrapperRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const visibleNodes = useMemo(() => {
        if (!ports) return [];
        if (selectedRoute || zoomK >= 2.5) {
            return ports.map(p => ({ ...p, clusterCount: 0 }));
        }
        // Cluster logic for low zoom
        const clusters = d3.rollups(ports, (v) => ({
            id: `cluster-${v[0].country}`,
            name: v[0].country,
            code: v[0].country.substring(0, 3).toUpperCase(),
            country: v[0].country,
            coordinates: [d3.mean(v, d => d.coordinates[0]) || 0, d3.mean(v, d => d.coordinates[1]) || 0] as [number, number],
            type: 'cluster',
            clusterCount: v.length,
            ports: v
        }), (d) => d.country);
        return clusters.map(([_, data]) => data);
    }, [ports, zoomK, selectedRoute]);

    useEffect(() => {
        // Only draw if we have data AND valid dimensions
        if (!geoData || !svgRef.current || !mapGroupRef.current || dimensions.width === 0 || dimensions.height === 0) return;

        const svg = d3.select(svgRef.current);
        const mapGroup = d3.select(mapGroupRef.current);
        const { width, height } = dimensions;

        // Create projection
        // Adjust scale based on screen width to prevent tiny map on mobile
        const baseScale = width / 6.5;
        const effectiveScale = Math.max(baseScale, 60); // Minimum scale for mobile

        const projection = d3.geoMercator()
            .scale(effectiveScale)
            .center([0, 20])
            .translate([width / 2, height / 2]);

        const pathGenerator = d3.geoPath().projection(projection);

        // Zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 12])
            .translateExtent([[-width, -height], [2 * width, 2 * height]])
            .on("zoom", (event) => {
                const { transform } = event;
                setZoomK(transform.k);
                mapGroup.attr("transform", transform.toString());

                // Semantic Zooming
                mapGroup.selectAll("path.country")
                    .attr("stroke-width", 0.5 / transform.k);

                mapGroup.selectAll("path.route-line")
                    .attr("stroke-width", (d: any) => (d.properties?.isInland ? 2 : 3) / transform.k)
                    .style("stroke-dasharray", (d: any) => d.properties?.isInland ? `${4 / transform.k},${4 / transform.k}` : (d.properties?.isActive ? `${8 / transform.k},${4 / transform.k}` : "none"));

                // Node scaling
                mapGroup.selectAll(".node-circle").attr("d", (d: any) => {
                    let size = 64;
                    if (d.type === 'cluster') size = (12 + Math.min(d.clusterCount, 5)) ** 2;
                    else if (d.type === 'INLAND') size = 64;
                    else size = 80; // Standard seaport

                    // Highlight selected
                    if (selectedPort?.id === d.id) size *= 1.5;
                    else if (selectedRoute?.transshipmentPort?.id === d.id) size *= 1.3;

                    const type = d.type === 'INLAND' ? d3.symbolSquare : d3.symbolCircle;
                    return d3.symbol().type(type).size(size / (transform.k * 0.6))();
                });

                mapGroup.selectAll(".node-label")
                    .attr("font-size", (10 / transform.k) + "px")
                    .attr("y", (d: any) => (d.type === 'cluster' ? 14 : 10) / transform.k);

                mapGroup.selectAll(".node-flag")
                    .attr("width", 16 / transform.k)
                    .attr("height", 12 / transform.k)
                    .attr("x", -8 / transform.k)
                    .attr("y", () => (-16 / transform.k));

                mapGroup.selectAll(".cluster-count")
                    .attr("font-size", (10 / transform.k) + "px")
                    .attr("dy", (4 / transform.k));
            });

        zoomBehaviorRef.current = zoom;

        // Initial Zoom setup
        if (!(svg.node() as any)?.__zoom) {
            svg.call(zoom);
        } else {
            const zoomHandler = zoom.on("zoom");
            if (zoomHandler) {
                svg.on(".zoom", zoomHandler);
            }
        }

        svg.on("click", (e) => {
            if (e.target === svgRef.current && onMapClick) onMapClick();
        });

        // --- DRAWING ---

        // 1. Countries
        mapGroup.select(".countries-group").remove();
        const countriesG = mapGroup.insert("g", ":first-child").attr("class", "countries-group");

        countriesG.selectAll("path")
            .data(geoData.features || [])
            .join("path")
            .attr("class", "country")
            .attr("d", pathGenerator as any)
            .attr("fill", "#cbd5e1") // Darker gray for land
            .attr("stroke", "#f8fafc") // White borders
            .attr("stroke-width", 0.5 / zoomK)
            .on("mouseenter", function () { d3.select(this).attr("fill", "#94a3b8"); })
            .on("mouseleave", function () { d3.select(this).attr("fill", "#cbd5e1"); });

        // 2. Routes
        mapGroup.select(".routes-group").remove();
        const routesG = mapGroup.append("g").attr("class", "routes-group");

        if (selectedRoute) {
            const drawLeg = (p1: Port, p2: Port, color: string, isInland: boolean, isActive: boolean) => {
                const link = { type: "LineString", coordinates: [p1.coordinates, p2.coordinates], properties: { isInland, isActive } };
                const path = routesG.append("path")
                    .datum(link)
                    .attr("class", `route-line ${isActive ? 'animate-dash' : ''}`)
                    .attr("d", (d: any) => pathGenerator(d))
                    .attr("fill", "none")
                    .attr("stroke", color)
                    .attr("stroke-width", (isInland ? 2 : 3) / zoomK)
                    .attr("opacity", 0.8)
                    .attr("stroke-linecap", "round");

                if (isInland) {
                    path.style("stroke-dasharray", `${4 / zoomK},${4 / zoomK}`);
                }
            };

            if (selectedRoute.preCarriage) {
                drawLeg(selectedRoute.preCarriage.origin, selectedRoute.preCarriage.destination, "#10b981", true, false);
            }
            selectedRoute.segments.forEach((segment, index) => {
                segment.legs.forEach((leg) => {
                    const origin = ports.find(p => p.id === leg.originPortId);
                    const dest = ports.find(p => p.id === leg.destinationPortId);
                    if (origin && dest) drawLeg(origin, dest, index === 0 ? "#2563eb" : "#ea580c", false, true);
                });
            });
            if (selectedRoute.onCarriage) {
                drawLeg(selectedRoute.onCarriage.origin, selectedRoute.onCarriage.destination, "#ef4444", true, false);
            }
        }

        // 3. Nodes (Ports/Clusters)
        const nodesG = mapGroup.selectAll(".nodes-group").data([null]).join("g").attr("class", "nodes-group");
        const nodes = nodesG.selectAll(".node-group").data(visibleNodes as any[], (d: any) => d.id);

        const nodesEnter = nodes.enter().append("g")
            .attr("class", "node-group")
            .attr("transform", (d: any) => `translate(${projection(d.coordinates)})`)
            .attr("cursor", "pointer")
            .on("click", (e, d: any) => {
                e.stopPropagation();
                if (d.type === 'cluster') {
                    const [x, y] = projection(d.coordinates)!;
                    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(zoomK * 2.5).translate(-x, -y));
                } else {
                    if (onPortClick) onPortClick(d);
                }
            });

        nodesEnter.append("path")
            .attr("class", "node-circle")
            .attr("d", d3.symbol().type(d3.symbolCircle).size(64)())
            .attr("fill", "#64748b")
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 1);

        nodesEnter.filter((d: any) => d.type !== 'cluster').append("image")
            .attr("class", "node-flag")
            .attr("href", (d: any) => `https://flagcdn.com/24x18/${d.code.substring(0, 2).toLowerCase()}.png`)
            .attr("opacity", 0)
            .attr("preserveAspectRatio", "none");

        nodesEnter.filter((d: any) => d.type === 'cluster').append("text")
            .attr("class", "cluster-count")
            .attr("text-anchor", "middle")
            .attr("fill", "white")
            .attr("font-weight", "bold")
            .text((d: any) => d.clusterCount);

        nodesEnter.append("text")
            .attr("class", "node-label")
            .attr("text-anchor", "middle")
            .text((d: any) => d.name)
            .attr("opacity", 0)
            .attr("pointer-events", "none")
            .attr("fill", "#1e293b")
            .style("text-shadow", "0px 1px 2px rgba(255,255,255,0.8)");

        nodes.exit().remove();

        // UPDATE PHASE
        nodesG.selectAll(".node-group")
            .attr("transform", (d: any) => {
                const coords = projection(d.coordinates);
                return coords ? `translate(${coords})` : null;
            });

        nodesG.selectAll(".node-circle")
            .attr("fill", (d: any) => {
                if (d.type === 'cluster') return "#3b82f6";
                if (d.type === 'INLAND') return "#d97706";
                if (selectedPort?.id === d.id) return "#8b5cf6";
                if (selectedRoute) {
                    const inRoute = selectedRoute.segments.some(s => s.legs.some(l => l.originPortId === d.id || l.destinationPortId === d.id))
                        || selectedRoute.preCarriage?.origin.id === d.id
                        || selectedRoute.onCarriage?.destination.id === d.id;
                    if (inRoute) return "#0ea5e9";
                }
                return "#64748b";
            });

        mapGroup.selectAll(".node-label")
            .transition().duration(200)
            .attr("opacity", (d: any) => (zoomK > 2.5 || d.type === 'cluster' || selectedPort?.id === d.id) ? 1 : 0);

        mapGroup.selectAll(".node-flag")
            .transition().duration(200)
            .attr("opacity", (d: any) => (zoomK > 4 && d.type !== 'cluster') ? 1 : 0);

    }, [geoData, dimensions, visibleNodes, selectedRoute, selectedPort, zoomK]);

    // Combined Loading State: Wait for Data OR Dimensions
    // This prevents rendering a 0x0 map (blank screen) while layout is calculating on mobile
    if (isLoading || (dimensions.width === 0 && !error)) {
        return (
            <div ref={wrapperRef} className="w-full h-full bg-slate-100 flex flex-col items-center justify-center text-slate-400 min-h-[200px]">
                <Loader2 className="animate-spin mb-3 text-blue-500" size={32} />
                <p className="text-sm font-medium animate-pulse">{isLoading ? "Fetching Map Data..." : "Initializing View..."}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div ref={wrapperRef} className="w-full h-full bg-slate-100 flex flex-col items-center justify-center text-slate-600 p-8 text-center min-h-[200px]">
                <div className="bg-red-50 p-4 rounded-full mb-4">
                    <AlertTriangle className="text-red-500" size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Map Loading Failed</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-xs">{error}</p>
                <button
                    onClick={() => setRetryTrigger(prev => prev + 1)}
                    className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 px-5 py-2 rounded-lg font-medium text-sm shadow-sm transition-all flex items-center gap-2"
                >
                    <RotateCcw size={16} /> Retry Connection
                </button>
            </div>
        );
    }

    return (
        <div ref={wrapperRef} className="w-full h-full bg-slate-100 relative overflow-hidden group touch-none">
            <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                className="w-full h-full outline-none block"
                style={{ background: '#f1f5f9', touchAction: 'none' }} // Critical for mobile gestures
            >
                <g ref={mapGroupRef} />
            </svg>
            <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
                <div className="bg-white/90 backdrop-blur rounded-lg shadow-lg border border-slate-200 p-1 flex flex-col gap-1">
                    <button onClick={() => { if (zoomBehaviorRef.current && svgRef.current) d3.select(svgRef.current).call(zoomBehaviorRef.current.scaleBy, 1.5); }} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Zoom In"><Plus size={18} /></button>
                    <button onClick={() => { if (zoomBehaviorRef.current && svgRef.current) d3.select(svgRef.current).call(zoomBehaviorRef.current.scaleBy, 0.66); }} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Zoom Out"><Minus size={18} /></button>
                    <button onClick={() => { if (zoomBehaviorRef.current && svgRef.current) d3.select(svgRef.current).call(zoomBehaviorRef.current.transform, d3.zoomIdentity); }} className="p-2 text-slate-600 hover:bg-slate-100 rounded" title="Reset View"><RotateCcw size={18} /></button>
                </div>
            </div>
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur p-3 rounded-lg text-xs text-slate-600 shadow-lg border border-slate-200 pointer-events-none hidden md:block">
                <div className="font-bold text-slate-400 uppercase mb-2 text-[10px]">Legend</div>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm"></span> Seaport</div>
                <div className="flex items-center gap-2 mb-1"><span className="w-2 h-2 bg-amber-600 shadow-sm rounded-sm"></span> Inland Hub</div>
                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-emerald-500 border-t border-dashed border-emerald-700"></span> Active Route</div>
            </div>
        </div>
    );
};

export default WorldMap;