const { transform } = require("esbuild");

const source = `
import React from 'react';
const cls = (...classes) => classes.filter(Boolean).join(' ');
const frac = (n, d) => n + '/' + d;
const Chip = ({children, variant, size}) => <span>{children}</span>;
const Terminal = () => <span />;
const RefreshCw = () => <span />;
const Trash2 = () => <span />;
const X = () => <span />;
const CheckCircle2 = () => <span />;
const Search = () => <span />;
const Server = () => <span />;
const Sparkles = () => <span />;
const Shield = () => <span />;
const Activity = () => <span />;
const Cpu = () => <span />;
const MemoryStick = () => <span />;
const Network = () => <span />;
const HardDrive = () => <span />;
const Database = () => <span />;
const Cloud = () => <span />;
const Globe = () => <span />;
const Mail = () => <span />;
const MapPin = () => <span />;
const Phone = () => <span />;
const Sparkles2 = () => <span />;
const Trash2 = () => <span />;
const Clock = () => <span />;
const Tag = () => <span />;
const ExternalLink = () => <span />;
const CheckCircle2 = () => <span />;
const AlertCircle = () => <span />;
const Info = () => <span />;
const Search = () => <span />;
const RefreshCw = () => <span />;
const Eye = () => <span />;
const Shield = () => <span />;
const Wifi = () => <span />;
const BarChart2 = () => <span />;
const Layers = () => <span />;
const FileText = () => <span />;
const Target = () => <span />;
const Zap = () => <span />;
const Lightbulb = () => <span />;
const Users = () => <span />;
const Building2 = () => <span />;
const ArrowRight = () => <span />;
const ArrowUpRight = () => <span />;
const RefreshCw = () => <span />;
const Trash2 = () => <span />;
const Clock = () => <span />;
const Tag = () => <span />;
const ExternalLink = () => <span />;
const CheckCircle2 = () => <span />;
const AlertCircle = () => <span />;
const Info = () => <span />;
const Search = () => <span />;
const RefreshCw = () => <span />;
const Eye = () => <span />;
const Shield = () => <span />;
const Wifi = () => <span />;
const BarChart2 = () => <span />;
const Layers = () => <span />;
const FileText = () => <span />;
const Target = () => <span />;
const Zap = () => <span />;
const Lightbulb = () => <span />;
const Users = () => <span />;
const Building2 = () => <span />;
const ArrowRight = () => <span />;
const ArrowUpRight = () => <span />;
const Globe = () => <span />;
const Mail = () => <span />;
const MapPin = () => <span />;
const Phone = () => <span />;
const Sparkles = () => <span />;
const Trash2 = () => <span />;
const Clock = () => <span />;
const Tag = () => <span />;
const ExternalLink = () => <span />;
const CheckCircle2 = () => <span />;
const AlertCircle = () => <span />;
const Info = () => <span />;
const Search = () => <span />;
const RefreshCw = () => <span />;
const Eye = () => <span />;
const Shield = () => <span />;
const Wifi = () => <span />;
const BarChart2 = () => <span />;
const Layers = () => <span />;
const FileText = () => <span />;
const Target = () => <span />;
const Zap = () => <span />;
const Lightbulb = () => <span />;
const Users = () => <span />;
const Building2 = () => <span />;
const ArrowRight = () => <span />;
const ArrowUpRight = () => <span />;
const cn = (...classes) => classes.filter(Boolean).join(' ');

const Test = ({ logs }) => (
  <div>
    {logs.length === 0 ? (
      <tr><td>Empty</td></tr>
    ) : (
      logs.map((log, index) => (
        <tr key={index} className="hover:bg-secondary/50">
          <td className="p-3 font-mono text-xs text-muted-foreground">
            {new Date(log.timestamp).toLocaleString()}
          </td>
          <td className="p-3">
            <span 
              className={log.level === 'error' ? 'danger' : log.level === 'warning' ? 'warning' : 'default'} 
              style={{fontSize: 'sm'}}
            >
              {log.level.toUpperCase()}
            </span>
          </td>
          <td className="p-3 font-mono text-sm text-foreground">{log.message}</td>
        </tr>
      ))}
    )}
  </div>
);

export default Test;
`;

const { transform } = require("esbuild");
transform(source, {
  loader: "tsx",
  jsx: "automatic",
  sourcefile: "test.tsx"
}).then(() => console.log("PASS")).catch((error) => {
  console.error("ERROR:", error.message);
  if (error.errors) {
    error.errors.forEach(e => console.error("Error detail:", e));
  }
});
