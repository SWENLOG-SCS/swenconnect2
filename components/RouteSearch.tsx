
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Carrier, Port, Service, TransshipmentConnection, RouteResult, InlandConnection } from '../types';
import { findRoutes } from '../utils/routeEngine';
import { parseShippingIntent, getPortInsights } from '../utils/ai';
import WorldMap from './WorldMap';
import { Search, Clock, ArrowRight, Map as MapIcon, Ship, X, MapPin, Globe, Network, ChevronDown, ChevronRight, Minimize2, Maximize2, SlidersHorizontal, Check, Train, Truck, Sparkles, Bot, Loader2, ExternalLink } from 'lucide-react';

interface RouteSearchProps {
  services: Service[];
  ports: Port[];
  carriers: Carrier[];
  connections: TransshipmentConnection[];
  inlandConnections: InlandConnection[];
  onSearch?: (polId: string, podId: string) => void;
}

const RouteSearch: React.FC<RouteSearchProps> = ({ services, ports, carriers, connections, inlandConnections, onSearch }) => {
  const [pol, setPol] = useState<string>('');
  const [pod, setPod] = useState<string>('');
  const [results, setResults] = useState<RouteResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  
  // AI Search State
  const [isAiMode, setIsAiMode] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const [selectedResult, setSelectedResult] = useState<RouteResult | null>(null);
  const [selectedPort, setSelectedPort] = useState<Port | null>(null);
  const [isDetailsPanelMinimized, setIsDetailsPanelMinimized] = useState(false);
  const [expandedSegments, setExpandedSegments] = useState<Record<number, boolean>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'DIRECT' | 'TRANSSHIPMENT'>('ALL');
  const [filterMaxTime, setFilterMaxTime] = useState<number>(60);
  const [filterCarriers, setFilterCarriers] = useState<string[]>([]);

  // AI Port Insights State
  const [aiInsight, setAiInsight] = useState<{ summary: string; sources: {title: string, uri: string}[] } | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  // Trigger search when POL/POD are set by AI
  useEffect(() => {
    if (isAiMode && pol && pod && !hasSearched) {
       handleSearch();
    }
  }, [pol, pod, isAiMode]);

  // Fetch AI Insights when a port is selected
  useEffect(() => {
    if (selectedPort) {
      setAiInsight(null);
      setLoadingInsight(true);
      getPortInsights(selectedPort)
        .then(data => setAiInsight(data))
        .finally(() => setLoadingInsight(false));
    }
  }, [selectedPort]);

  const handleAiSearch = async () => {
    if (!aiQuery.trim()) return;
    setIsAiProcessing(true);
    setHasSearched(false);
    
    try {
      const intent = await parseShippingIntent(aiQuery, ports);
      
      if (intent.originId) setPol(intent.originId);
      if (intent.destinationId) setPod(intent.destinationId);
      
      if (!intent.originId || !intent.destinationId) {
        alert("Could not map one or both locations. Please try standard search or be more specific.");
        setIsAiMode(false); // Fallback
      }
    } catch (e) {
      console.error(e);
      alert("AI Service unavailable.");
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleSearch = () => {
    if (!pol || !pod) return;
    if (pol === pod) return alert("POL and POD cannot be the same.");

    const routes = findRoutes(pol, pod, services, ports, connections, inlandConnections);
    setResults(routes);
    setHasSearched(true);
    
    if (onSearch) onSearch(pol, pod);
    setSelectedResult(null);
    setSelectedPort(null);
  };

  const filteredResults = useMemo(() => {
      return results.filter(route => {
          if (filterType !== 'ALL' && filterType !== 'TRANSSHIPMENT') { 
             if (route.type !== filterType && route.type !== 'INTERMODAL') return false; 
          }
          if (route.totalTransitTime > filterMaxTime) return false;
          if (filterCarriers.length > 0) {
              const routeCarriers = route.segments.map(s => s.service.carrierId);
              if (routeCarriers.some(rc => !filterCarriers.includes(rc))) return false;
          }
          return true;
      });
  }, [results, filterType, filterMaxTime, filterCarriers]);

  const handleRouteSelect = useCallback((result: RouteResult) => {
      setSelectedResult(result);
      setSelectedPort(null);
      setIsDetailsPanelMinimized(false);
      const initialExpanded: Record<number, boolean> = {};
      result.segments.forEach((_, i) => initialExpanded[i] = true);
      setExpandedSegments(initialExpanded);
  }, []);

  const toggleSegment = (index: number) => {
      setExpandedSegments(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleCarrierFilter = (carrierId: string) => {
      setFilterCarriers(prev => prev.includes(carrierId) ? prev.filter(id => id !== carrierId) : [...prev, carrierId]);
  };

  const getCarrierName = (id: string) => carriers.find(c => c.id === id)?.name;
  const getCarrierLogo = (id: string) => carriers.find(c => c.id === id)?.logo;
  const getServicesForPort = (portId: string) => services.filter(service => service.legs.some(leg => leg.originPortId === portId || leg.destinationPortId === portId));
  const getConnectionsForPort = (portId: string) => connections.filter(c => c.portId === portId && c.isActive);
  const selectedPortServices = selectedPort ? getServicesForPort(selectedPort.id) : [];
  const selectedPortConnections = selectedPort ? getConnectionsForPort(selectedPort.id) : [];

  return (
    <div className="flex flex-col h-full w-full">
      <div className="bg-white shadow-sm border-b border-slate-200 z-30 relative shrink-0">
        <div className="p-4 max-w-7xl mx-auto">
            {/* Search Mode Toggle */}
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                {isAiMode ? <Sparkles size={16} className="text-purple-600"/> : <Search size={16} className="text-blue-600"/>}
                {isAiMode ? "AI Route Assistant" : "Standard Route Finder"}
              </h2>
              <button 
                onClick={() => { setIsAiMode(!isAiMode); setHasSearched(false); setResults([]); setAiQuery(''); setPol(''); setPod(''); }}
                className={`text-xs px-3 py-1 rounded-full font-medium transition-colors flex items-center gap-1 ${isAiMode ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'}`}
              >
                {isAiMode ? "Switch to Manual Search" : <><Sparkles size={12}/> Try AI Search</>}
              </button>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-end md:items-center">
                <div className="flex-1 w-full">
                  {isAiMode ? (
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Bot size={18} className="text-purple-500" />
                      </div>
                      <input 
                        type="text"
                        value={aiQuery}
                        onChange={(e) => setAiQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
                        className="w-full pl-10 pr-24 py-3 bg-purple-50/50 border border-purple-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                        placeholder="e.g., I need to ship containers from Munich to Shanghai via rail..."
                      />
                      <button 
                        onClick={handleAiSearch}
                        disabled={isAiProcessing || !aiQuery.trim()}
                        className="absolute right-1 top-1 bottom-1 bg-purple-600 hover:bg-purple-700 text-white px-4 rounded-md text-xs font-bold transition-colors disabled:opacity-50"
                      >
                         {isAiProcessing ? <Loader2 size={14} className="animate-spin"/> : "Ask AI"}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Origin (POL / Hub)</label>
                            <select value={pol} onChange={(e) => setPol(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Select Origin...</option>
                                {ports.sort((a,b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.type === 'INLAND' ? `🚂 ${p.name}` : p.name} ({p.code})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Destination (POD / Hub)</label>
                            <select value={pod} onChange={(e) => setPod(e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                                <option value="">Select Destination...</option>
                                {ports.sort((a,b) => a.name.localeCompare(b.name)).map(p => <option key={p.id} value={p.id}>{p.type === 'INLAND' ? `🚂 ${p.name}` : p.name} ({p.code})</option>)}
                            </select>
                        </div>
                    </div>
                  )}
                </div>

                {!isAiMode && (
                  <div className="flex gap-2 w-full md:w-auto">
                      <button onClick={() => setShowFilters(!showFilters)} className={`px-4 py-2.5 rounded-lg border flex items-center justify-center gap-2 font-medium transition-colors ${showFilters ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <SlidersHorizontal size={18} /> Filters
                      </button>
                      <button onClick={handleSearch} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors shadow-sm">
                          <Search size={18} /> Find Routes
                      </button>
                  </div>
                )}
            </div>
            {showFilters && !isAiMode && (
                <div className="mt-4 pt-4 border-t border-slate-100 animate-in slide-in-from-top-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Route Type</label>
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                {['ALL', 'DIRECT', 'TRANSSHIPMENT'].map((type) => (
                                    <button key={type} onClick={() => setFilterType(type as any)} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${filterType === type ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{type === 'TRANSSHIPMENT' ? 'Transship' : type.charAt(0) + type.slice(1).toLowerCase()}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2"><label className="block text-xs font-semibold text-slate-500 uppercase">Max Transit Time</label><span className="text-xs font-bold text-blue-600">{filterMaxTime} Days</span></div>
                            <input type="range" min="1" max="90" value={filterMaxTime} onChange={(e) => setFilterMaxTime(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"/>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Preferred Carriers</label>
                            <div className="flex flex-wrap gap-2">{carriers.map(carrier => (<button key={carrier.id} onClick={() => toggleCarrierFilter(carrier.id)} className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-all ${filterCarriers.includes(carrier.id) ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: carrier.color }}></span>{carrier.code}{filterCarriers.includes(carrier.id) && <Check size={10} />}</button>))}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
         {/* Sidebar */}
         <div className="w-full h-[40vh] lg:h-full lg:w-96 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 overflow-y-auto z-10 shadow-xl lg:shadow-none shrink-0">
            {!hasSearched && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center bg-slate-50/50">
                    <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                        {isAiMode ? <Bot size={32} className="text-purple-300"/> : <MapIcon size={32} className="text-slate-300"/>}
                    </div>
                    <h3 className="text-lg font-semibold text-slate-600 mb-1">{isAiMode ? "AI Logistics Assistant" : "Explore the Network"}</h3>
                    <p className="text-sm max-w-[200px]">{isAiMode ? "Type your request naturally and let AI map the route." : "Select a Port of Loading and Discharge to visualize viable routes."}</p>
                </div>
            )}
            
            {hasSearched && filteredResults.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                    <Ship size={48} className="mb-4 text-slate-200"/>
                    <p>No routes found matching your criteria.</p>
                </div>
            )}

            {filteredResults.map((result, index) => (
                <div key={result.id} onClick={() => handleRouteSelect(result)} className={`p-4 border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50 ${selectedResult?.id === result.id ? 'bg-blue-50/80 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}>
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            {result.type === 'DIRECT' ? <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Direct</span> : 
                             result.type === 'INTERMODAL' ? <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Intermodal</span> :
                             <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Transshipment</span>}
                            <span className="text-slate-400 text-xs font-mono">#{index + 1}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-700 font-bold"><Clock size={14} className="text-slate-400"/> {result.totalTransitTime} days</div>
                    </div>
                    
                    <div className="space-y-3 mt-3">
                        {/* Pre-Carriage */}
                        {result.preCarriage && (
                             <div className="relative pl-4 border-l-2 border-dashed border-slate-300 ml-1">
                                <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-slate-300"></div>
                                <div className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1 uppercase font-bold tracking-wide">
                                    {result.preCarriage.mode === 'RAIL' ? <Train size={10}/> : <Truck size={10}/>} {result.preCarriage.mode}
                                </div>
                                <div className="font-semibold text-xs text-slate-700 flex items-center gap-1">
                                    {result.preCarriage.origin.name} <ArrowRight size={10} className="text-slate-400"/> {result.preCarriage.destination.name}
                                </div>
                             </div>
                        )}
                        
                        {/* Sea Segments */}
                        {result.segments.map((seg, i) => (
                             <div key={i} className="relative pl-4 border-l-2 border-slate-200 ml-1">
                                <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-blue-400 ring-2 ring-white"></div>
                                <div className="text-xs text-slate-500 mb-1 flex items-center gap-2">
                                    {getCarrierLogo(seg.service.carrierId) && <img src={getCarrierLogo(seg.service.carrierId)} className="w-4 h-4 object-contain" />}
                                    <span className="font-medium text-slate-600">{getCarrierName(seg.service.carrierId)}</span>
                                </div>
                                <div className="font-bold text-sm text-slate-800">{seg.service.name}</div>
                                <div className="text-xs text-slate-500 flex items-center gap-1 mt-1 font-mono">
                                    {seg.origin.code} <ArrowRight size={10}/> {seg.destination.code} 
                                    <span className="text-slate-300 mx-1">|</span> {seg.transitTime} days
                                </div>
                            </div>
                        ))}
                        
                        {/* On-Carriage */}
                        {result.onCarriage && (
                             <div className="relative pl-4 border-l-2 border-dashed border-slate-300 ml-1">
                                <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-slate-300"></div>
                                <div className="text-[10px] text-slate-500 mb-0.5 flex items-center gap-1 uppercase font-bold tracking-wide">
                                    {result.onCarriage.mode === 'RAIL' ? <Train size={10}/> : <Truck size={10}/>} {result.onCarriage.mode}
                                </div>
                                <div className="font-semibold text-xs text-slate-700 flex items-center gap-1">
                                    {result.onCarriage.origin.name} <ArrowRight size={10} className="text-slate-400"/> {result.onCarriage.destination.name}
                                </div>
                             </div>
                        )}
                    </div>
                </div>
            ))}
         </div>

         {selectedResult && (
            <div className={`bg-white border-r border-slate-200 z-20 flex flex-col transition-all duration-300 ease-in-out shadow-xl lg:shadow-none absolute lg:relative h-full ${isDetailsPanelMinimized ? 'w-full lg:w-14' : 'w-full lg:w-80'}`}>
                <div className={`p-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur flex justify-between items-center ${isDetailsPanelMinimized ? 'flex-col gap-4 p-2' : ''}`}>
                    {!isDetailsPanelMinimized && (
                        <div className="w-full">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Selected Route</div>
                            <div className="flex items-baseline gap-2"><span className="text-2xl font-bold text-slate-800">{selectedResult.totalTransitTime}</span><span className="text-xs font-medium text-slate-500">Days Total</span></div>
                        </div>
                    )}
                    <div className="flex gap-1">
                        <button onClick={() => setIsDetailsPanelMinimized(!isDetailsPanelMinimized)} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-white rounded-md transition-colors">{isDetailsPanelMinimized ? <Maximize2 size={16}/> : <Minimize2 size={16}/>}</button>
                        <button onClick={() => setSelectedResult(null)} className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-white rounded-md transition-colors"><X size={16}/></button>
                    </div>
                </div>

                {!isDetailsPanelMinimized && (
                    <div className="overflow-y-auto p-5 space-y-6 flex-1">
                        {selectedResult.preCarriage && (
                             <div className="relative group">
                                <div className="w-full flex items-start gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mt-0.5 shrink-0 shadow-sm border border-amber-200">
                                        {selectedResult.preCarriage.mode === 'RAIL' ? <Train size={16}/> : <Truck size={16}/>}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-sm">Inland Transport</div>
                                        <div className="text-xs text-slate-500">{selectedResult.preCarriage.origin.name} to {selectedResult.preCarriage.destination.name}</div>
                                        <div className="mt-2 bg-amber-50/50 border border-amber-100 p-2 rounded text-xs font-mono flex justify-between text-amber-800">
                                            <span className="uppercase font-bold">{selectedResult.preCarriage.mode}</span>
                                            <span>{selectedResult.preCarriage.transitTime}d</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute left-[15px] top-10 bottom-[-24px] w-0.5 border-l-2 border-slate-300 border-dashed -z-10"></div>
                             </div>
                        )}
                        {selectedResult.segments.map((segment, idx) => (
                             <div key={idx} className="relative group">
                                <div className="absolute left-[15px] top-10 bottom-[-24px] w-0.5 bg-slate-200 -z-10"></div>
                                <div className="w-full flex items-start gap-3 mb-3 cursor-pointer p-1 rounded-lg hover:bg-slate-50 transition-colors" onClick={() => toggleSegment(idx)}>
                                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-white overflow-hidden shrink-0 shadow-sm">
                                        {getCarrierLogo(segment.service.carrierId) ? <img src={getCarrierLogo(segment.service.carrierId)} className="w-full h-full object-cover"/> : <span className="text-slate-400">{idx + 1}</span>}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5 justify-between">
                                            {segment.service.name} 
                                            {expandedSegments[idx] ? <ChevronDown size={14} className="text-slate-400"/> : <ChevronRight size={14} className="text-slate-400"/>}
                                        </div>
                                        <div className="text-xs text-slate-500 mb-1">{getCarrierName(segment.service.carrierId)}</div>
                                    </div>
                                </div>
                                {expandedSegments[idx] && (
                                     <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs ml-11 mb-4 animate-in slide-in-from-top-2 fade-in">
                                         <div className="space-y-2">
                                            {segment.legs.map((leg, lIdx) => (
                                                <div key={lIdx} className="flex justify-between items-center text-slate-600">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                                                        <span className="font-mono font-bold text-slate-700">{ports.find(p => p.id === leg.originPortId)?.code}</span>
                                                        <ArrowRight size={10} className="text-slate-400"/>
                                                        <span className="font-mono font-bold text-slate-700">{ports.find(p => p.id === leg.destinationPortId)?.code}</span>
                                                    </div>
                                                    <span className="bg-white px-1.5 py-0.5 border rounded text-[10px] font-medium">{leg.transitTimeDays}d</span>
                                                </div>
                                            ))}
                                         </div>
                                     </div>
                                )}
                             </div>
                        ))}
                        {selectedResult.onCarriage && (
                             <div className="relative group mt-4">
                                <div className="w-full flex items-start gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mt-0.5 shrink-0 shadow-sm border border-amber-200">
                                        {selectedResult.onCarriage.mode === 'RAIL' ? <Train size={16}/> : <Truck size={16}/>}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-800 text-sm">Delivery</div>
                                        <div className="text-xs text-slate-500">{selectedResult.onCarriage.origin.name} to {selectedResult.onCarriage.destination.name}</div>
                                        <div className="mt-2 bg-amber-50/50 border border-amber-100 p-2 rounded text-xs font-mono flex justify-between text-amber-800">
                                            <span className="uppercase font-bold">{selectedResult.onCarriage.mode}</span>
                                            <span>{selectedResult.onCarriage.transitTime}d</span>
                                        </div>
                                    </div>
                                </div>
                             </div>
                        )}
                    </div>
                )}
            </div>
         )}
         
         {/* Map Container */}
         <div className="flex-1 bg-slate-100 relative overflow-hidden h-full lg:h-auto min-h-[50vh] lg:min-h-0">
            <WorldMap ports={ports} selectedRoute={selectedResult} selectedPort={selectedPort} onPortClick={setSelectedPort} onMapClick={() => setSelectedPort(null)}/>
            
            {/* Port Details Overlay with AI Insights */}
            {selectedPort && !selectedResult && (
                <div className="absolute top-4 right-4 w-80 bg-white/95 backdrop-blur-md shadow-2xl rounded-xl border border-slate-200 overflow-hidden flex flex-col max-h-[calc(100%-2rem)] animate-in slide-in-from-right-4 fade-in duration-300 z-20">
                     <div className="bg-slate-800 text-white p-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><MapPin size={12}/> Port Profile</div>
                                <h3 className="text-xl font-bold leading-tight flex items-center gap-2">
                                    <img src={`https://flagcdn.com/24x18/${selectedPort.code.substring(0, 2).toLowerCase()}.png`} alt={selectedPort.country} className="rounded-[2px] shadow-sm h-4" onError={(e) => {(e.target as HTMLImageElement).style.display = 'none';}}/>
                                    {selectedPort.name}
                                </h3>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="bg-white/10 text-white border border-white/20 text-xs px-2 py-0.5 rounded font-mono">{selectedPort.code}</span>
                                    <span className="text-sm text-slate-300 flex items-center gap-1"><Globe size={12}/> {selectedPort.country}</span>
                                </div>
                            </div>
                            <button onClick={() => setSelectedPort(null)} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
                        </div>
                     </div>
                     <div className="p-4 overflow-y-auto">
                        
                        {/* AI Insights Section */}
                        <div className="mb-6 bg-gradient-to-br from-purple-50 to-white rounded-lg border border-purple-100 p-3 shadow-sm">
                           <h4 className="text-xs font-bold text-purple-700 uppercase mb-2 flex items-center gap-1.5">
                             <Sparkles size={12} /> Live AI Insights
                           </h4>
                           {loadingInsight ? (
                             <div className="flex items-center gap-2 text-purple-400 text-xs animate-pulse py-2">
                               <Loader2 size={12} className="animate-spin" /> Analyzing real-time status...
                             </div>
                           ) : aiInsight ? (
                             <div className="text-xs text-slate-700 space-y-2">
                                <div className="prose prose-xs text-slate-600 max-w-none">
                                  {aiInsight.summary}
                                </div>
                                {aiInsight.sources.length > 0 && (
                                  <div className="pt-2 border-t border-purple-100 flex flex-wrap gap-2">
                                    {aiInsight.sources.slice(0, 2).map((src, i) => (
                                      <a key={i} href={src.uri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-100 text-[10px] text-purple-600 hover:text-purple-800 hover:underline">
                                        <ExternalLink size={8}/> {src.title.length > 15 ? src.title.substring(0,15)+'...' : src.title}
                                      </a>
                                    ))}
                                  </div>
                                )}
                             </div>
                           ) : (
                             <div className="text-xs text-slate-400 italic">No recent updates found.</div>
                           )}
                        </div>

                         <div className="mb-4">
                             <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 border-b border-slate-200 pb-2">Calling Services ({selectedPortServices.length})</h4>
                             {selectedPortServices.length === 0 ? (<div className="text-center py-6 text-slate-400 text-sm">No services scheduled for this port.</div>) : (<div className="space-y-3">{selectedPortServices.map((service, idx) => {const inboundLeg = service.legs.find(l => l.destinationPortId === selectedPort.id);const outboundLeg = service.legs.find(l => l.originPortId === selectedPort.id);return (<div key={idx} className="bg-slate-50 border border-slate-100 rounded-lg p-3 hover:border-slate-300 transition-colors"><div className="flex justify-between items-start mb-2"><div><div className="font-bold text-slate-800 text-sm">{service.name}</div><div className="text-xs text-slate-500">{getCarrierName(service.carrierId)}</div></div><span className="text-[10px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">{service.code}</span></div><div className="grid grid-cols-2 gap-2 mt-2">{inboundLeg && (<div className="bg-white p-1.5 rounded border border-slate-100"><span className="text-[10px] text-slate-400 block uppercase">Inbound From</span><div className="text-xs font-semibold text-slate-700 flex items-center gap-1"><ArrowRight size={10} className="rotate-180 text-emerald-500"/>{ports.find(p => p.id === inboundLeg.originPortId)?.code}</div></div>)}{outboundLeg && (<div className="bg-white p-1.5 rounded border border-slate-100"><span className="text-[10px] text-slate-400 block uppercase">Outbound To</span><div className="text-xs font-semibold text-slate-700 flex items-center gap-1"><ArrowRight size={10} className="text-blue-500"/>{ports.find(p => p.id === outboundLeg.destinationPortId)?.code}</div></div>)}</div></div>)})}</div>)}
                         </div>
                         {selectedPortConnections.length > 0 && (<div className="mt-6"><h4 className="text-xs font-bold text-slate-500 uppercase mb-3 border-b border-slate-200 pb-2 flex items-center gap-2"><Network size={12}/> Hub Connections ({selectedPortConnections.length})</h4><div className="space-y-2">{selectedPortConnections.map(conn => {const sA = services.find(s => s.id === conn.serviceAId);const sB = services.find(s => s.id === conn.serviceBId);if (!sA || !sB) return null;return (<div key={conn.id} className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg flex items-center justify-between shadow-sm"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><span className="bg-white px-1.5 rounded border border-emerald-200 text-xs">{sA.code}</span><ArrowRight size={12} className="text-emerald-500"/><span className="bg-white px-1.5 rounded border border-emerald-200 text-xs">{sB.code}</span></div><span className="text-[10px] font-bold text-emerald-700 bg-white/50 px-1.5 py-0.5 rounded uppercase">Active</span></div>);})}</div></div>)}
                     </div>
                </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default RouteSearch;
