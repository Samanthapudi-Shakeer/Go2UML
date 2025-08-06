import React, { useState, useEffect, useRef } from 'react';
import { Download, ZoomIn, ZoomOut, RotateCcw, ExternalLink, Copy, Code2 } from 'lucide-react';
import mermaid from 'mermaid';

const DEFAULT_GO_CODE = `package main

type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

type ReadWriter interface {
    Reader
    Writer
}

type File struct {
    name string
    content []byte
}

func (f *File) Read(p []byte) (n int, err error) {
    return 0, nil
}

func (f *File) Write(p []byte) (n int, err error) {
    return 0, nil
}`;

function App() {
  const [goCode, setGoCode] = useState(DEFAULT_GO_CODE);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [currentScale, setCurrentScale] = useState(1);
  const [hasDiagram, setHasDiagram] = useState(false);
  const umlOutputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: false, 
      theme: 'default',
      themeVariables: {
        primaryColor: '#2C3E50',
        primaryTextColor: '#2C3E50',
        primaryBorderColor: '#D4AF37',
        lineColor: '#34495E',
        secondaryColor: '#ECF0F1',
        tertiaryColor: '#F8F9FA'
      }
    });
    
    // Generate initial diagram
    handleGenerate();
  }, []);

  const parseGoToMermaid = (code: string): string => {
    const entities: any = {};
    const relationships = new Set<string>();
    
    const getEntity = (name: string, type = 'class') => {
      if (!entities[name]) {
        entities[name] = { name, type, fields: [], methods: [], embedded: [] };
      }
      return entities[name];
    };

    const cleanCode = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    const typeRegex = /type\s+(\w+)\s+(struct|interface)\s*\{([\s\S]*?)\}/g;
    let match;

    while ((match = typeRegex.exec(cleanCode)) !== null) {
      const [, name, type, body] = match;
      const entity = getEntity(name, type);
      const lines = body.trim().split(/\r?\n/);
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        const embeddedMatch = trimmed.match(/^(\w+)$/);
        if (embeddedMatch) {
          entity.embedded.push(embeddedMatch[1]);
          relationships.add(`${embeddedMatch[1]} <|-- ${name}`);
          return;
        }
        
        if (type === 'struct') {
          const fieldMatch = trimmed.match(/^(\w+)\s+([\w\.\*\[\]]+)/);
          if (fieldMatch) {
            entity.fields.push({ name: fieldMatch[1], type: fieldMatch[2] });
          }
        } else {
          const methodMatch = trimmed.match(/^(\w+)\((.*?)\)\s*(.*)/);
          if (methodMatch) {
            entity.methods.push({ 
              name: methodMatch[1], 
              params: methodMatch[2], 
              returns: methodMatch[3].trim() 
            });
          }
        }
      });
    }

    const methodRegex = /func\s+\(\s*\w+\s+([\*]?\w+)\s*\)\s+(\w+)\s*\((.*?)\)\s*(.*?)\s*\{/g;
    while ((match = methodRegex.exec(cleanCode)) !== null) {
      const [, receiverType, methodName, params, returns] = match;
      const cleanReceiver = receiverType.replace('*', '');
      const entity = getEntity(cleanReceiver);
      entity.methods.push({ name: methodName, params, returns: returns.trim() });
    }

    Object.values(entities).filter((e: any) => e.type === 'interface').forEach((iface: any) => {
      Object.values(entities).filter((e: any) => e.type === 'class').forEach((cls: any) => {
        const implementsAll = iface.methods.every((im: any) =>
          cls.methods.some((cm: any) => cm.name === im.name)
        );
        if (implementsAll) {
          relationships.add(`${iface.name} <|.. ${cls.name}`);
        }
      });
    });

    let mermaidString = '';
    Object.values(entities).forEach((entity: any) => {
      mermaidString += `class ${entity.name} {\n`;
      if (entity.type === 'interface') {
        mermaidString += `    <<Interface>>\n`;
      }
      
      entity.fields.forEach((f: any) => {
        const visibility = f.name[0] === f.name[0].toUpperCase() ? '+' : '-';
        mermaidString += `    ${visibility}${f.name}: ${f.type}\n`;
      });
      
      entity.methods.forEach((m: any) => {
        const visibility = m.name[0] === m.name[0].toUpperCase() ? '+' : '-';
        mermaidString += `    ${visibility}${m.name}(${m.params}) ${m.returns}\n`;
      });
      
      mermaidString += '}\n';
    });
    
    mermaidString += Array.from(relationships).join('\n');
    return mermaidString;
  };

  const handleGenerate = async () => {
    if (!goCode.trim()) {
      setError('Please enter some Go code.');
      return;
    }

    setError('');
    setIsGenerating(true);
    setCurrentScale(1);

    try {
      const mermaidSyntax = parseGoToMermaid(goCode);
      if (!mermaidSyntax) {
        throw new Error("Could not parse any structs or interfaces from the code.");
      }

      const fullDiagram = `classDiagram\n${mermaidSyntax}`;
      const { svg } = await mermaid.render('graphDiv', fullDiagram);
      
      if (umlOutputRef.current) {
        umlOutputRef.current.innerHTML = svg;
        setHasDiagram(true);
      }
    } catch (error) {
      setError(`Error: ${(error as Error).message}`);
      if (umlOutputRef.current) {
        umlOutputRef.current.innerHTML = '<p class="text-red-600 text-center">Failed to generate diagram.</p>';
      }
      setHasDiagram(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleZoom = (delta: number) => {
    const newScale = Math.max(0.1, Math.min(3, currentScale + delta));
    setCurrentScale(newScale);
    if (umlOutputRef.current) {
      umlOutputRef.current.style.transform = `scale(${newScale})`;
    }
  };

  const resetZoom = () => {
    setCurrentScale(1);
    if (umlOutputRef.current) {
      umlOutputRef.current.style.transform = 'scale(1)';
    }
  };

  const downloadSvg = () => {
    const svg = umlOutputRef.current?.querySelector('svg');
    if (svg) {
      const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, 'uml-diagram.svg');
    }
  };

  const downloadPng = () => {
    const svg = umlOutputRef.current?.querySelector('svg');
    if (svg) {
      const canvas = document.createElement('canvas');
      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svgData], { type: 'image/svg+xml' }));
      
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(blob => {
            if (blob) {
              const pngUrl = URL.createObjectURL(blob);
              triggerDownload(pngUrl, 'uml-diagram.png');
            }
          });
        }
      };
      img.src = url;
    }
  };

  const openInTab = () => {
    const svg = umlOutputRef.current?.querySelector('svg');
    if (svg) {
      const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    }
  };

  const copyToClipboard = async () => {
    const svg = umlOutputRef.current?.querySelector('svg');
    if (svg) {
      try {
        await navigator.clipboard.writeText(svg.outerHTML);
        alert('SVG copied to clipboard!');
      } catch (err) {
        alert('Clipboard copy failed. Try a secure context (HTTPS).');
      }
    }
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-8 md:px-8">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-gradient-to-r from-blue-800 to-green-900 p-4 rounded-2xl shadow-lg">
              <Code2 className="w-12 h-12 text-white" />
            </div>
          </div>
            <h3 className="text-4xl md:text-2xl font-bold bg-gradient-to-r from-slate-800 via-green-800 to-indigo-900 bg-clip-text text-transparent mb-4"> basic </h3>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-slate-800 via-blue-800 to-indigo-900 bg-clip-text text-transparent mb-4">
            Go Code to UML Generator
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Transform your Go code into UML class diagrams
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Panel */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-4 border-b border-slate-300">
              <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                <Code2 className="w-5 h-5" />
                Go Source Code
              </h2>
            </div>
            <div className="p-6">
              <textarea
                value={goCode}
                onChange={(e) => setGoCode(e.target.value)}
                className="w-full h-96 p-4 border-2 border-slate-200 rounded-xl bg-slate-50 font-mono text-sm
                         focus:border-blue-500 focus:ring-4 focus:ring-blue-200 focus:bg-white
                         transition-all duration-200 resize-none shadow-inner"
                placeholder="Paste your Go code here..."
              />
              
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="mt-6 w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800
                         text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 
                         shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed
                         disabled:transform-none border-2 border-blue-700 flex items-center justify-center gap-3"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Generating Diagram...
                  </>
                ) : (
                  <>
                    <Code2 className="w-5 h-5" />
                    Generate UML Diagram
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Output Panel */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-4 border-b border-slate-300">
              <h2 className="text-xl font-semibold text-white">Generated UML Diagram</h2>
            </div>
            <div className="p-6">
              <div className="border-2 border-dashed border-slate-200 rounded-xl min-h-[450px] overflow-auto bg-slate-50 shadow-inner">
                <div
                  ref={umlOutputRef}
                  className="p-4 transition-transform duration-200 origin-top-left"
                  style={{ transform: `scale(${currentScale})` }}
                >
                  {!hasDiagram && !isGenerating && (
                    <div className="flex items-center justify-center h-96 text-slate-400">
                      <p className="text-lg">Your UML diagram will appear here</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Controls */}
              {hasDiagram && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleZoom(0.1)}
                    className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg
                             transition-colors duration-150 flex items-center gap-2 font-medium shadow-sm"
                  >
                    <ZoomIn className="w-4 h-4" />
                    Zoom In
                  </button>
                  <button
                    onClick={() => handleZoom(-0.1)}
                    className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg
                             transition-colors duration-150 flex items-center gap-2 font-medium shadow-sm"
                  >
                    <ZoomOut className="w-4 h-4" />
                    Zoom Out
                  </button>
                  <button
                    onClick={resetZoom}
                    className="bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 px-3 py-2 rounded-lg
                             transition-colors duration-150 flex items-center gap-2 font-medium shadow-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </button>
                  <button
                    onClick={downloadSvg}
                    className="bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-700 px-3 py-2 rounded-lg
                             transition-colors duration-150 flex items-center gap-2 font-medium shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    SVG
                  </button>
                  <button
                    onClick={downloadPng}
                    className="bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-700 px-3 py-2 rounded-lg
                             transition-colors duration-150 flex items-center gap-2 font-medium shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    PNG
                  </button>
                  <button
                    onClick={openInTab}
                    className="bg-blue-100 hover:bg-blue-200 border border-blue-300 text-blue-700 px-3 py-2 rounded-lg
                             transition-colors duration-150 flex items-center gap-2 font-medium shadow-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open
                  </button>
                  <button
                    onClick={copyToClipboard}
                    className="bg-purple-100 hover:bg-purple-200 border border-purple-300 text-purple-700 px-3 py-2 rounded-lg
                             transition-colors duration-150 flex items-center gap-2 font-medium shadow-sm"
                  >
                    <Copy className="w-4 h-4" />
                    Copy
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 font-medium">{error}</p>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center mt-16">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-white rounded-full shadow-lg border border-slate-200">
            <p className="text-slate-600 font-medium">© Shakeer Samanthapudi</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
