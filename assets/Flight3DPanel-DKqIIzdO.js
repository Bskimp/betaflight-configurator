import{$ as e,B as t,D as n,F as r,Ft as i,Gt as a,M as o,P as s,Pt as c,Q as l,R as u,T as d,Wt as f,X as p,et as m,gt as h,j as g,jt as _,rt as v}from"./en-ByNq5RPq.js";import{Bt as y,Cn as b,Dn as ee,Fn as te,Gn as ne,In as x,Jn as S,Jt as C,Kt as w,Lt as re,Pn as T,Rn as E,Rt as D,Sn as O,Ut as k,Vt as ie,Xn as A,Yn as j,Zn as M,an as N,dn as P,en as F,gn as ae,hn as oe,jn as I,ln as se,mn as ce,on as L,p as le,pn as ue,qn as de,rn as R,t as fe,un as z,xn as pe,yn as me,zn as he,zt as B}from"./Button-BsApteV6.js";import{a as ge,c as _e,i as ve,l as ye,n as be,o as xe,r as Se,s as Ce,t as we,u as Te}from"./main-RR7eT1L3.js";var Ee=5,De=1<<Ce.indexOf(`GPS_FIX`),Oe=1e6,ke=150,Ae=5e4,je=8e4,Me=5e5,Ne=1e6,Pe=4e4,Fe=2e6,Ie=1,Le=.18,Re=1050,ze=5e5,Be=2,Ve=2,He=15,Ue=we;function We(e){let t=t=>e.getMainFieldIndexByName(t),n=t(`GPS_numSat`),r=t(`GPS_coord[0]`),i=t(`GPS_coord[1]`);if(n===void 0||r===void 0||i===void 0)return{fixes:[],baro:null,idle:null};let a=t(`baroAlt`),o=t(`rcCommand[3]`),s=new Ge(n,r,i,t(`GPS_altitude`),t(`stateFlags`)),c=a===void 0?null:new Ke(a),l=o===void 0?null:new qe(o);for(let t of e.getChunksInTimeRange(e.getMinTime(),e.getMaxTime()))for(let e of t.frames){let t=e[1];s.add(t,e),c?.add(t,e),l?.add(t,e)}return{fixes:s.fixes(),baro:c&&Ye(c.samples,l&&Je(l,c.samples)),idle:l?.idle()??null}}var Ge=class{iSat;iLat;iLon;iAlt;iState;found=[];heldUntil=[];current=null;constructor(e,t,n,r,i){this.iSat=e,this.iLat=t,this.iLon=n,this.iAlt=r,this.iState=i}add(e,t){let n=t[this.iLat],r=t[this.iLon];if(!this.hasFix(t)||!Number.isFinite(n)||!Number.isFinite(r)){this.current=null;return}let i=this.iAlt===void 0?0:t[this.iAlt],a=this.current;if(a?.lat===n&&a.lon===r&&a.alt===i){this.heldUntil[this.heldUntil.length-1]=e;return}this.current={lat:n,lon:r,alt:i},this.found.push({tUs:e,lat:n/1e7,lon:r/1e7,altM:i/10}),this.heldUntil.push(e)}fixes(){return Xe(this.found,this.heldUntil)}hasFix(e){let t=this.iState===void 0?null:e[this.iState];return e[this.iSat]>=Ee&&(t==null||(t&De)!==0)}},Ke=class{index;samples=[];constructor(e){this.index=e}add(e,t){let n=t[this.index]/100,r=this.samples.at(-1)?.tUs??-1/0;Number.isFinite(n)&&e-r>=Ae&&this.samples.push({tUs:e,altM:n})}},qe=class{index;firstUs=null;takeoffUs=null;lastUs=0;lastUpUs=null;constructor(e){this.index=e}add(e,t){this.firstUs??=e,this.lastUs=e,t[this.index]>Re&&(this.takeoffUs??=e,this.lastUpUs=e)}idle(){return this.firstUs===null?null:this.takeoffUs===null||this.lastUpUs===null?{untilUs:this.lastUs,fromUs:this.firstUs}:{untilUs:this.takeoffUs===this.firstUs?null:this.takeoffUs,fromUs:this.lastUpUs===this.lastUs?null:this.lastUpUs}}};function Je(e,t){let{firstUs:n,takeoffUs:r}=e;if(n===null||r===null||r-n<ze)return null;let i=t.filter(e=>e.tUs>=r-ze&&e.tUs<r).map(e=>e.altM);return i.length>=3&&Math.max(...i)-Math.min(...i)<=Ve?r:null}function Ye(e,t){return e.map(({tUs:n})=>{let r=t!==null&&n>=t-Me&&n<=t+Ne?Me:je,i=e.slice(H(e,n-r),H(e,n+r)).map(e=>e.altM).sort((e,t)=>e-t);return{tUs:n,altM:i[i.length>>1]}})}function Xe(e,t){let n=e.slice(1).map((t,n)=>t.tUs-e[n].tUs);n.sort((e,t)=>e-t);let r=Math.min(Math.max(n[n.length>>1]??0,5e4),Oe),i=[];return e.forEach((n,a)=>{i.push(n);let o=e[a+1],s=o&&t[a]>=o.tUs-r?o.tUs-r/2:t[a];if(!(s-n.tUs<Oe))for(let e=n.tUs+r;e<=s;e+=r)i.push({...n,tUs:e})}),i}function Ze(e){let{fixes:t,baro:n,idle:r}=We(e);return Qe(t,n,r)}function Qe(e,t,n=null){if(e.length<2)return null;let r={lat:e[0].lat,lon:e[0].lon,altM:e[0].altM},i=new Ue(r.lat,r.lon,r.altM,0),a=(e,t,n)=>{let r=i.WGS_BS(e,t,n);return{n:r.x,u:r.y,e:r.z}},o=$e(e,a);if(o.length<2)return null;let{samples:s,gapAfter:c}=et(o,t&&t.length>=2&&t.some(e=>e.altM!==t[0].altM)?st(o,t):lt(o)),l=ut(s,o,n);return{origin:r,samples:s,gapAfter:c,pinned:l,groundU:l===`none`?s[0].u:0,bounds:nt(s),box:rt(o),toLocal:a,positionAt:it(s,c)}}function $e(e,t){let n=[];for(let r of e){let e={...r,...t(r.lat,r.lon,r.altM)},i=n.at(-1),a=i?(e.tUs-i.tUs)/1e6:1;(!i||a>0&&Math.hypot(e.n-i.n,e.e-i.e)/a<=ke)&&n.push(e)}return n}function et(e,t){let n=[],r=[],i=0;for(let a=1;a<=e.length;a++)a<e.length&&e[a].tUs-e[a-1].tUs<=Fe||(tt(e.slice(i,a),t,n),a<e.length&&r.push(n.length-1),i=a);let a=new Uint8Array(n.length);for(let e of r)a[e]=1;return{samples:n,gapAfter:a}}function tt(e,t,n){let r=at(e),i=e.at(-1).tUs,a=0;for(let o=e[0].tUs;;o=Math.min(o+Pe,e[a+1].tUs)){for(;a<e.length-2&&e[a+1].tUs<=o;)a++;let{n:s,e:c}=ot(e,r,a,o);if(n.push({tUs:o,n:s,e:c,u:t(o)}),o===i)return}}function V(e){let t=1/0,n=-1/0;for(let r of e)t=Math.min(t,r),n=Math.max(n,r);return[t,n]}function nt(e){let[t,n]=V(e.map(e=>e.n)),[r,i]=V(e.map(e=>e.e)),[a,o]=V(e.map(e=>e.u));return{minN:t,maxN:n,minE:r,maxE:i,minU:a,maxU:o}}function rt(e){let[t,n]=V(e.map(e=>e.lat)),[r,i]=V(e.map(e=>e.lon));return{minLat:t,maxLat:n,minLon:r,maxLon:i}}function it(e,t){return n=>{if(n<e[0].tUs||n>e.at(-1).tUs)return null;let r=Math.max(0,H(e,n)-1),i=e[r],a=e[Math.min(r+1,e.length-1)];if(a===i||n===i.tUs)return{n:i.n,u:i.u,e:i.e};if(t[r])return null;let o=(n-i.tUs)/(a.tUs-i.tUs);return{n:i.n+(a.n-i.n)*o,u:i.u+(a.u-i.u)*o,e:i.e+(a.e-i.e)*o}}}function at(e){let t=(t,n)=>{let r=Math.max(0,t-1),i=Math.min(e.length-1,t+1);return i>r?(e[i][n]-e[r][n])*1e6/(e[i].tUs-e[r].tUs):0};return{vn:e.map((e,n)=>t(n,`n`)),ve:e.map((e,n)=>t(n,`e`))}}function ot(e,t,n,r){let i=Math.min(n+1,e.length-1),a=(e[i].tUs-e[n].tUs)/1e6;if(a<=0)return{n:e[n].n,e:e[n].e};let o=(r-e[n].tUs)/1e6/a,s=o*o,c=s*o,l=2*c-3*s+1,u=c-2*s+o,d=-2*c+3*s,f=c-s;return{n:l*e[n].n+u*a*t.vn[n]+d*e[i].n+f*a*t.vn[i],e:l*e[n].e+u*a*t.ve[n]+d*e[i].e+f*a*t.ve[i]}}function st(e,t){let n=t.map(e=>e.tUs),r=ct(t),i=e.map(e=>e.u-pt(n,r,e.tUs)).sort((e,t)=>e-t),a=i[i.length>>1];return e=>pt(n,r,e)+a}function ct(e){let t=3*Le*1e6,n=0,r=0;return e.map(i=>{for(;e[n].tUs<i.tUs-t;)n++;for(;r<e.length&&e[r].tUs<=i.tUs+t;)r++;let a=0,o=0,s=0,c=0,l=0;for(let t=n;t<r;t++){let n=(e[t].tUs-i.tUs)/1e6,r=Math.exp(-.5*(n/Le)**2);a+=r,o+=r*n,s+=r*n*n,c+=r*e[t].altM,l+=r*n*e[t].altM}let u=a*s-o*o;return u>1e-12?(c*s-l*o)/u:i.altM})}function lt(e){let t=e.map(e=>e.tUs),n=ft(t,e.map(e=>e.u),Ie);return e=>pt(t,n,e)}function ut(e,t,n){let r=t[0],i=t.at(-1),a=n?.untilUs==null?null:dt(e,t,r,r.tUs,Math.min(n.untilUs,i.tUs));if(a===null)return`none`;let o=n?.fromUs==null?null:dt(e,t,i,Math.max(n.fromUs,r.tUs),i.tUs),s=Math.hypot(i.n-r.n,i.e-r.e)<=He;if(o===null||!s){for(let t of e)t.u-=a;return`start`}let c=e[0].tUs,l=e.at(-1).tUs-c||1;for(let t of e)t.u-=a+(o-a)*(t.tUs-c)/l;return`both`}function dt(e,t,n,r,i){let a=t.filter(e=>e.tUs>=r&&e.tUs<=i);if(a.length<3||a.at(-1).tUs-a[0].tUs<ze||a.some(e=>Math.hypot(e.n-n.n,e.e-n.e)>Be))return null;let o=1/0,s=-1/0,c=0,l=0;for(let t of e)t.tUs>=r&&t.tUs<=i&&(o=Math.min(o,t.u),s=Math.max(s,t.u),c+=t.u,l++);return s-o>Ve?null:c/l}function ft(e,t,n){let r=t.slice();for(let t=1;t<r.length;t++){let i=1-Math.exp(-(e[t]-e[t-1])/1e6/n);r[t]=r[t-1]+i*(r[t]-r[t-1])}for(let t=r.length-2;t>=0;t--){let i=1-Math.exp(-(e[t+1]-e[t])/1e6/n);r[t]=r[t+1]+i*(r[t]-r[t+1])}return r}function pt(e,t,n){if(n<=e[0])return t[0];if(n>=e.at(-1))return t.at(-1);let r=H(e,n)-1,i=(n-e[r])/(e[r+1]-e[r]);return t[r]+(t[r+1]-t[r])*i}function H(e,t){let n=0,r=e.length;for(;n<r;){let i=n+r>>1,a=e[i];(typeof a==`number`?a:a.tUs)<=t?n=i+1:r=i}return n}var mt=new I().setFromAxisAngle(new j(1,0,0),-Math.PI/2),ht=mt.clone().invert(),gt=32767,_t=2e4;function vt(e,t,n){let r=e/gt,i=t/gt,a=n/gt,o=r*r+i*i+a*a,s=0;if(o<1)s=Math.sqrt(1-o);else{let e=Math.sqrt(o);r/=e,i/=e,a/=e}return new I(r,i,a,s)}function yt(e,t=new I){return t.copy(mt).multiply(e).multiply(ht)}function bt(e){let[t,n,r]=[0,1,2].map(t=>e.getMainFieldIndexByName(`imuQuaternion[${t}]`));if(t===void 0||n===void 0||r===void 0)return null;let i=[],a=[];for(let o of e.getChunksInTimeRange(e.getMinTime(),e.getMaxTime()))for(let e of o.frames){let o=a.length;o&&a[o-3]===e[t]&&a[o-2]===e[n]&&a[o-1]===e[r]||(i.push(e[1]),a.push(e[t],e[n],e[r]))}if(!i.length)return null;let o=e=>yt(vt(a[3*e],a[3*e+1],a[3*e+2]));return{at(e,t=new I){let n=0,r=i.length;for(;n<r;){let t=n+r>>1;i[t]<=e?n=t+1:r=t}let a=Math.max(0,n-1);if(a>=i.length-1||e<=i[0])return t.copy(o(a));let s=Math.max(i[a],i[a+1]-_t),c=e<=s?0:(e-s)/(i[a+1]-s);return t.slerpQuaternions(o(a),o(a+1),c)}}}var xt=new k,U=new j,St=class extends se{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type=`LineSegmentsGeometry`,this.setIndex([0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5]),this.setAttribute(`position`,new R([-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],3)),this.setAttribute(`uv`,new R([-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],2))}applyMatrix4(e){let t=this.attributes.instanceStart,n=this.attributes.instanceEnd;return t!==void 0&&(t.applyMatrix4(e),n.applyMatrix4(e),t.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new z(t,6,1);return this.setAttribute(`instanceStart`,new P(n,3,0)),this.setAttribute(`instanceEnd`,new P(n,3,3)),this.instanceCount=this.attributes.instanceStart.count,this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));let n=new z(t,6,1);return this.setAttribute(`instanceColorStart`,new P(n,3,0)),this.setAttribute(`instanceColorEnd`,new P(n,3,3)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new M(e.geometry)),this}fromLineSegments(e){let t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new k);let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;e!==void 0&&t!==void 0&&(this.boundingBox.setFromBufferAttribute(e),xt.setFromBufferAttribute(t),this.boundingBox.union(xt))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new E),this.boundingBox===null&&this.computeBoundingBox();let e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(e!==void 0&&t!==void 0){let n=this.boundingSphere.center;this.boundingBox.getCenter(n);let r=0;for(let i=0,a=e.count;i<a;i++)U.fromBufferAttribute(e,i),r=Math.max(r,n.distanceToSquared(U)),U.fromBufferAttribute(t,i),r=Math.max(r,n.distanceToSquared(U));this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error(`THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.`,this)}}toJSON(){}};B.line={worldUnits:{value:1},linewidth:{value:1},resolution:{value:new S},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}},D.line={uniforms:de.merge([B.common,B.fog,B.line]),vertexShader:`
		#include <common>
		#include <color_pars_vertex>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>
		#include <clipping_planes_pars_vertex>

		uniform float linewidth;
		uniform vec2 resolution;

		attribute vec3 instanceStart;
		attribute vec3 instanceEnd;

		attribute vec3 instanceColorStart;
		attribute vec3 instanceColorEnd;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#ifdef USE_DASH

			uniform float dashScale;
			attribute float instanceDistanceStart;
			attribute float instanceDistanceEnd;
			varying float vLineDistance;

		#endif

		float trimSegmentAlpha( const in vec4 start, const in vec4 end ) {

			// compute the interpolation factor needed to trim the segment so it terminates
			// between the camera plane and the near plane

			// conservative estimate of the near plane
			float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
			float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column

			// we need different nearEstimate formula for reversed and default depth buffer
			// a is positive with a reversed depth buffer so it can be used for controlling the code flow
			float nearEstimate = ( a > 0.0 ) ? ( - b / ( a + 1.0 ) ) : ( - 0.5 * b / a );

			return ( nearEstimate - start.z ) / ( end.z - start.z );

		}

		void main() {

			#ifdef USE_COLOR

				vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

			#endif

			float aspect = resolution.x / resolution.y;

			// camera space
			vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

			#ifdef USE_DASH

				float lineDistanceStart = dashScale * instanceDistanceStart;
				float lineDistanceEnd = dashScale * instanceDistanceEnd;

			#endif

			#ifdef WORLD_UNITS

				worldStart = start.xyz;
				worldEnd = end.xyz;

			#else

				vUv = uv;

			#endif

			// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
			// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
			// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
			// perhaps there is a more elegant solution -- WestLangley

			bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

			if ( perspective ) {

				if ( start.z < 0.0 && end.z >= 0.0 ) {

					float alpha = trimSegmentAlpha( start, end );
					end.xyz = mix( start.xyz, end.xyz, alpha );

					#ifdef USE_DASH

						lineDistanceEnd = mix( lineDistanceStart, lineDistanceEnd, alpha );

					#endif

				} else if ( end.z < 0.0 && start.z >= 0.0 ) {

					float alpha = trimSegmentAlpha( end, start );
					start.xyz = mix( end.xyz, start.xyz, alpha );

					#ifdef USE_DASH

						lineDistanceStart = mix( lineDistanceEnd, lineDistanceStart, alpha );

					#endif

				}

			}

			#ifdef USE_DASH

				vLineDistance = ( position.y < 0.5 ) ? lineDistanceStart : lineDistanceEnd;
				vUv = uv;

			#endif

			// clip space
			vec4 clipStart = projectionMatrix * start;
			vec4 clipEnd = projectionMatrix * end;

			// ndc space
			vec3 ndcStart = clipStart.xyz / clipStart.w;
			vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

			// direction
			vec2 dir = ndcEnd.xy - ndcStart.xy;

			// account for clip-space aspect ratio
			dir.x *= aspect;
			dir = normalize( dir );

			#ifdef WORLD_UNITS

				vec3 worldDir = normalize( end.xyz - start.xyz );
				vec3 tmpFwd = normalize( mix( start.xyz, end.xyz, 0.5 ) );
				vec3 worldUp = normalize( cross( worldDir, tmpFwd ) );
				vec3 worldFwd = cross( worldDir, worldUp );
				worldPos = position.y < 0.5 ? start: end;

				// height offset
				float hw = linewidth * 0.5;
				worldPos.xyz += position.x < 0.0 ? hw * worldUp : - hw * worldUp;

				// don't extend the line if we're rendering dashes because we
				// won't be rendering the endcaps
				#ifndef USE_DASH

					// cap extension
					worldPos.xyz += position.y < 0.5 ? - hw * worldDir : hw * worldDir;

					// add width to the box
					worldPos.xyz += worldFwd * hw;

					// endcaps
					if ( position.y > 1.0 || position.y < 0.0 ) {

						worldPos.xyz -= worldFwd * 2.0 * hw;

					}

				#endif

				// project the worldpos
				vec4 clip = projectionMatrix * worldPos;

				// shift the depth of the projected points so the line
				// segments overlap neatly
				vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
				clip.z = clipPose.z * clip.w;

			#else

				vec2 offset = vec2( dir.y, - dir.x );
				// undo aspect ratio adjustment
				dir.x /= aspect;
				offset.x /= aspect;

				// sign flip
				if ( position.x < 0.0 ) offset *= - 1.0;

				// endcaps
				if ( position.y < 0.0 ) {

					offset += - dir;

				} else if ( position.y > 1.0 ) {

					offset += dir;

				}

				// adjust for linewidth
				offset *= linewidth;

				// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
				offset /= resolution.y;

				// select end
				vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

				// back to clip space
				offset *= clip.w;

				clip.xy += offset;

			#endif

			gl_Position = clip;

			vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

			#include <logdepthbuf_vertex>
			#include <clipping_planes_vertex>
			#include <fog_vertex>

		}
		`,fragmentShader:`
		uniform vec3 diffuse;
		uniform float opacity;
		uniform float linewidth;

		#ifdef USE_DASH

			uniform float dashOffset;
			uniform float dashSize;
			uniform float gapSize;

		#endif

		varying float vLineDistance;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#include <common>
		#include <color_pars_fragment>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>
		#include <clipping_planes_pars_fragment>

		vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

			float mua;
			float mub;

			vec3 p13 = p1 - p3;
			vec3 p43 = p4 - p3;

			vec3 p21 = p2 - p1;

			float d1343 = dot( p13, p43 );
			float d4321 = dot( p43, p21 );
			float d1321 = dot( p13, p21 );
			float d4343 = dot( p43, p43 );
			float d2121 = dot( p21, p21 );

			float denom = d2121 * d4343 - d4321 * d4321;

			float numer = d1343 * d4321 - d1321 * d4343;

			mua = numer / denom;
			mua = clamp( mua, 0.0, 1.0 );
			mub = ( d1343 + d4321 * ( mua ) ) / d4343;
			mub = clamp( mub, 0.0, 1.0 );

			return vec2( mua, mub );

		}

		void main() {

			float alpha = opacity;
			vec4 diffuseColor = vec4( diffuse, alpha );

			#include <clipping_planes_fragment>

			#ifdef USE_DASH

				if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

				if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

			#endif

			#ifdef WORLD_UNITS

				// Find the closest points on the view ray and the line segment
				vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
				vec3 lineDir = worldEnd - worldStart;
				vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

				vec3 p1 = worldStart + lineDir * params.x;
				vec3 p2 = rayEnd * params.y;
				vec3 delta = p1 - p2;
				float len = length( delta );
				float norm = len / linewidth;

				#ifndef USE_DASH

					#ifdef USE_ALPHA_TO_COVERAGE

						float dnorm = fwidth( norm );
						alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

					#else

						if ( norm > 0.5 ) {

							discard;

						}

					#endif

				#endif

			#else

				#ifdef USE_ALPHA_TO_COVERAGE

					// artifacts appear on some hardware if a derivative is taken within a conditional
					float a = vUv.x;
					float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
					float len2 = a * a + b * b;
					float dlen = fwidth( len2 );

					if ( abs( vUv.y ) > 1.0 ) {

						alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

					}

				#else

					if ( abs( vUv.y ) > 1.0 ) {

						float a = vUv.x;
						float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
						float len2 = a * a + b * b;

						if ( len2 > 1.0 ) discard;

					}

				#endif

			#endif

			#include <logdepthbuf_fragment>
			#include <color_fragment>

			gl_FragColor = vec4( diffuseColor.rgb, alpha );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			#include <fog_fragment>
			#include <premultiplied_alpha_fragment>

		}
		`};var Ct=class extends x{constructor(e){super({type:`LineMaterial`,uniforms:de.clone(D.line.uniforms),vertexShader:D.line.vertexShader,fragmentShader:D.line.fragmentShader,clipping:!0}),this.isLineMaterial=!0,this.setValues(e)}get color(){return this.uniforms.diffuse.value}set color(e){this.uniforms.diffuse.value=e}get worldUnits(){return`WORLD_UNITS`in this.defines}set worldUnits(e){e===!0!==this.worldUnits&&(this.needsUpdate=!0),e===!0?this.defines.WORLD_UNITS=``:delete this.defines.WORLD_UNITS}get linewidth(){return this.uniforms.linewidth.value}set linewidth(e){this.uniforms.linewidth&&(this.uniforms.linewidth.value=e)}get dashed(){return`USE_DASH`in this.defines}set dashed(e){e===!0!==this.dashed&&(this.needsUpdate=!0),e===!0?this.defines.USE_DASH=``:delete this.defines.USE_DASH}get dashScale(){return this.uniforms.dashScale.value}set dashScale(e){this.uniforms.dashScale.value=e}get dashSize(){return this.uniforms.dashSize.value}set dashSize(e){this.uniforms.dashSize.value=e}get dashOffset(){return this.uniforms.dashOffset.value}set dashOffset(e){this.uniforms.dashOffset.value=e}get gapSize(){return this.uniforms.gapSize.value}set gapSize(e){this.uniforms.gapSize.value=e}get opacity(){return this.uniforms.opacity.value}set opacity(e){this.uniforms&&(this.uniforms.opacity.value=e)}get resolution(){return this.uniforms.resolution.value}set resolution(e){this.uniforms.resolution.value.copy(e)}get alphaToCoverage(){return`USE_ALPHA_TO_COVERAGE`in this.defines}set alphaToCoverage(e){this.defines&&(e===!0!==this.alphaToCoverage&&(this.needsUpdate=!0),e===!0?this.defines.USE_ALPHA_TO_COVERAGE=``:delete this.defines.USE_ALPHA_TO_COVERAGE)}},wt=new A,Tt=new j,Et=new j,W=new A,G=new A,K=new A,Dt=new j,Ot=new pe,q=new ce,kt=new j,J=new k,Y=new E,X=new A,Z,Q;function At(e,t,n){return X.set(0,0,-t,1).applyMatrix4(e.projectionMatrix),X.multiplyScalar(1/X.w),X.x=Q/n.width,X.y=Q/n.height,X.applyMatrix4(e.projectionMatrixInverse),X.multiplyScalar(1/X.w),Math.abs(Math.max(X.x,X.y))}function jt(e,t){let n=e.matrixWorld,r=e.geometry,i=r.attributes.instanceStart,a=r.attributes.instanceEnd,o=Math.min(r.instanceCount,i.count);for(let r=0,s=o;r<s;r++){q.start.fromBufferAttribute(i,r),q.end.fromBufferAttribute(a,r),q.applyMatrix4(n);let o=new j,s=new j;Z.distanceSqToSegment(q.start,q.end,s,o),s.distanceTo(o)<Q*.5&&t.push({point:s,pointOnLine:o,distance:Z.origin.distanceTo(s),object:e,face:null,faceIndex:r,uv:null,uv1:null})}}function Mt(e,t,n){let r=t.projectionMatrix,i=e.material.resolution,a=e.matrixWorld,o=e.geometry,s=o.attributes.instanceStart,c=o.attributes.instanceEnd,l=Math.min(o.instanceCount,s.count),u=-t.near;Z.at(1,K),K.w=1,K.applyMatrix4(t.matrixWorldInverse),K.applyMatrix4(r),K.multiplyScalar(1/K.w),K.x*=i.x/2,K.y*=i.y/2,K.z=0,Dt.copy(K),Ot.multiplyMatrices(t.matrixWorldInverse,a);for(let t=0,o=l;t<o;t++){if(W.fromBufferAttribute(s,t),G.fromBufferAttribute(c,t),W.w=1,G.w=1,W.applyMatrix4(Ot),G.applyMatrix4(Ot),W.z>u&&G.z>u)continue;if(W.z>u){let e=W.z-G.z,t=(W.z-u)/e;W.lerp(G,t)}else if(G.z>u){let e=G.z-W.z,t=(G.z-u)/e;G.lerp(W,t)}W.applyMatrix4(r),G.applyMatrix4(r),W.multiplyScalar(1/W.w),G.multiplyScalar(1/G.w),W.x*=i.x/2,W.y*=i.y/2,G.x*=i.x/2,G.y*=i.y/2,q.start.copy(W),q.start.z=0,q.end.copy(G),q.end.z=0;let o=q.closestPointToPointParameter(Dt,!0);q.at(o,kt);let l=me.lerp(W.z,G.z,o),d=l>=-1&&l<=1,f=Dt.distanceTo(kt)<Q*.5;if(d&&f){q.start.fromBufferAttribute(s,t),q.end.fromBufferAttribute(c,t),q.start.applyMatrix4(a),q.end.applyMatrix4(a);let r=new j,i=new j;Z.distanceSqToSegment(q.start,q.end,i,r),n.push({point:i,pointOnLine:r,distance:Z.origin.distanceTo(i),object:e,face:null,faceIndex:t,uv:null,uv1:null})}}}var Nt=class extends O{constructor(e=new St,t=new Ct({color:Math.random()*16777215})){super(e,t),this.isLineSegments2=!0,this.type=`LineSegments2`}computeLineDistances(){let e=this.geometry,t=e.attributes.instanceStart,n=e.attributes.instanceEnd,r=new Float32Array(2*t.count);for(let e=0,i=0,a=t.count;e<a;e++,i+=2)Tt.fromBufferAttribute(t,e),Et.fromBufferAttribute(n,e),r[i]=i===0?0:r[i-1],r[i+1]=r[i]+Tt.distanceTo(Et);let i=new z(r,2,1);return e.setAttribute(`instanceDistanceStart`,new P(i,1,0)),e.setAttribute(`instanceDistanceEnd`,new P(i,1,1)),this}raycast(e,t){let n=this.material.worldUnits,r=e.camera;if(r===null&&!n&&console.error(`LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.`),n===!1&&(this.material.resolution.x===0||this.material.resolution.y===0))return;let i=e.params.Line2===void 0?0:e.params.Line2.threshold||0;Z=e.ray;let a=this.matrixWorld,o=this.geometry,s=this.material;Q=s.linewidth+i,o.boundingSphere===null&&o.computeBoundingSphere(),Y.copy(o.boundingSphere).applyMatrix4(a);let c;if(c=n?Q*.5:At(r,Math.max(r.near,Y.distanceToPoint(Z.origin)),s.resolution),Y.radius+=c,Z.intersectsSphere(Y)===!1)return;o.boundingBox===null&&o.computeBoundingBox(),J.copy(o.boundingBox).applyMatrix4(a);let l;l=n?Q*.5:At(r,Math.max(r.near,J.distanceToPoint(Z.origin)),s.resolution),J.expandByScalar(l),Z.intersectsBox(J)!==!1&&(n?jt(this,t):Mt(this,r,t))}onBeforeRender(e){let t=this.material.uniforms;t&&t.resolution&&(e.getViewport(wt),this.material.uniforms.resolution.value.set(wt.z,wt.w))}},Pt=.35,Ft=12,It={map:{url:`https://tile.openstreetmap.org/{z}/{x}/{y}.png`,maxZoom:19,attribution:`© OpenStreetMap contributors`},satellite:{url:`https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}`,maxZoom:20,attribution:`Imagery © Google`}};function Lt(e,t,n){let r=2**n,i=t*Math.PI/180;return{x:(e+180)/360*r,y:(1-Math.log(Math.tan(i)+1/Math.cos(i))/Math.PI)/2*r}}function Rt(e,t,n){let r=2**n;return{lon:e/r*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*t/r)))*180/Math.PI}}function zt(e,t){let n=Lt(e.minLon,e.maxLat,t),r=Lt(e.maxLon,e.minLat,t);return{x0:Math.floor(n.x),x1:Math.floor(r.x),y0:Math.floor(n.y),y1:Math.floor(r.y)}}function Bt(e){let t=(e.maxLat-e.minLat)*.2,n=(e.maxLon-e.minLon)*.2;return{minLat:e.minLat-t,maxLat:e.maxLat+t,minLon:e.minLon-n,maxLon:e.maxLon+n}}function Vt(e,t=19){let n=Bt(e);for(let e=t;e>Ft;e--){let t=zt(n,e);if((t.x1-t.x0+1)*(t.y1-t.y0+1)<=64)return e}return Ft}function Ht(e){let{box:t,source:n,groundU:r,toLocal:i,onTileLoaded:a}=e,o=Vt(t,n.maxZoom),s=zt(Bt(t),o),c=new L,l=new ne().setCrossOrigin(`anonymous`),u=[],d=!1;for(let e=s.x0;e<=s.x1;e++)for(let t=s.y0;t<=s.y1;t++){let s=[[e,t],[e+1,t],[e,t+1],[e+1,t+1]].map(([e,t])=>{let{lon:n,lat:r}=Rt(e,t,o);return i(r,n)}),f=new w;f.setAttribute(`position`,new R(s.flatMap(e=>[e.n,r,e.e]),3)),f.setAttribute(`uv`,new R([0,1,1,1,0,0,1,0],2)),f.setIndex([0,2,1,1,2,3]);let p=new b,m=new O(f,p);m.renderOrder=10,m.visible=!1,c.add(m);let h=n.url.replace(`{z}`,String(o)).replace(`{x}`,String(e)).replace(`{y}`,String(t));l.load(h,e=>{if(d){e.dispose();return}e.colorSpace=T,u.push(e),p.map=e,p.needsUpdate=!0,m.visible=!0,a()})}return{group:c,setTranslucent(e){for(let t of c.children){let n=t.material;n.transparent=e,n.opacity=e?Pt:1,n.depthWrite=!e,n.needsUpdate=!0}},dispose(){d=!0,c.traverse(e=>{e instanceof O&&(e.geometry.dispose(),e.material.dispose())});for(let e of u)e.dispose()}}}var Ut=2e6,Wt=.12,Gt=10,Kt=new k,qt=.15,Jt=`./resources/models/quad_x.gltf`,Yt=1/8,Xt=-Math.PI/2,$=be.map(({color:e})=>new C(e.slice(0,7)));function Zt(e,t){let n=Math.min(1,Math.max(0,e))*($.length-1),r=Math.min($.length-2,Math.floor(n));return t.copy($[r]).lerp($[r+1],n-r)}var Qt=class{canvas;renderer;scene=new te;camera=new ee(50,1,.5,2e4);controls;drone=new L;marker=new O(new he(qt,16,12),new b({color:$.at(-1)}));model=null;hasAttitude=!1;trackObjects=new L;track=null;traveled=null;segmentsBefore=new Uint32Array;ground=null;belowMap=!1;groundSource=`map`;follow=!1;renderFrame=null;active=!0;disposed=!1;constructor(e){this.canvas=e,this.renderer=new y({canvas:e,antialias:!0,alpha:!0}),this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)),this.renderer.setClearColor(0,0),this.controls=new ye(this.camera,e),this.controls.maxPolarAngle=Math.PI*.49,this.controls.addEventListener(`change`,()=>this.requestRender());let t=new F(16777215,1.5);t.position.set(1,3,2),this.scene.add(new ie(16777215,1),t),this.drone.visible=!1,this.drone.add(this.marker),this.scene.add(this.trackObjects,this.drone),new re().load(Jt,e=>{let t=e.scene;if(this.disposed){t.traverse($t);return}t.scale.setScalar(Yt),t.rotation.y=Xt,this.model=t,this.drone.add(t),this.showDroneShape(),this.requestRender()})}setTrack(e){if(this.clearTrack(),this.track=e,!e){this.requestRender();return}let{samples:t,gapAfter:n,groundU:r}=e,i=Math.max(1,e.bounds.maxU-r),a=[],o=[],s=new C;this.segmentsBefore=new Uint32Array(t.length+1);let c=0;for(let e=0;e<t.length;e++)if(this.segmentsBefore[e]=c,!(e===t.length-1||n[e])){for(let n of[t[e],t[e+1]])a.push(n.n,n.u,n.e),Zt((n.u-r)/i,s),o.push(s.r,s.g,s.b);c++}this.segmentsBefore[t.length]=c;let l=new St().setPositions(a).setColors(o);this.traveled=new St().setPositions(a).setColors(o),this.trackObjects.add(new Nt(l,new Ct({linewidth:2,vertexColors:!0,transparent:!0,opacity:.35})),new Nt(this.traveled,new Ct({linewidth:4,vertexColors:!0})));let u=[],d=[],f=-1/0;for(let e of t)e.tUs<f||(f=e.tUs+Ut,Zt((e.u-r)/i,s),u.push(e.n,e.u,e.e,e.n,r,e.e),d.push(s.r,s.g,s.b,s.r,s.g,s.b));let p=new w;p.setAttribute(`position`,new R(u,3)),p.setAttribute(`color`,new R(d,3)),this.trackObjects.add(new ae(p,new oe({vertexColors:!0,transparent:!0,opacity:.25})));let{minN:m,maxN:h,minE:g,maxE:_}=e.bounds,v=Math.max(h-m,_-g,50),y=new N(v*1.6,16);y.material.transparent=!0,y.material.opacity=.2,y.material.depthWrite=!1,y.position.set((m+h)/2,r-.05,(g+_)/2),this.trackObjects.add(y),this.buildGround(),this.frameTrack(),this.setTime(t[0].tUs,null)}setGroundSource(e){this.groundSource=e,this.buildGround(),this.requestRender()}setTime(e,t){let n=this.track;if(!this.active||!n||!this.traveled)return null;this.traveled.instanceCount=this.segmentsBefore[H(n.samples,e)];let r=n.positionAt(e);if(this.drone.visible=!!r,r&&(this.drone.position.set(r.n,r.u,r.e),t&&this.drone.quaternion.copy(t),this.hasAttitude=!!t,this.showDroneShape(),this.follow)){let e=this.drone.position.clone().sub(this.controls.target);this.controls.target.add(e),this.camera.position.add(e),this.controls.update()}return this.requestRender(),r}setFollow(e){this.follow=e}pickTime(e,t){let n=this.track;if(!n)return null;let r=this.canvas.getBoundingClientRect(),i=new j,a=null,o=Gt;this.camera.updateMatrixWorld();for(let s of n.samples){if(i.set(s.n,s.u,s.e).project(this.camera),i.z>1)continue;let n=r.left+(i.x+1)/2*r.width,c=r.top+(1-i.y)/2*r.height,l=Math.hypot(n-e,c-t);l<o&&(o=l,a=s.tUs)}return a}resize(e,t){this.disposed||!this.active||e<=0||t<=0||(this.renderer.setSize(e,t,!1),this.camera.aspect=e/t,this.camera.updateProjectionMatrix(),this.requestRender())}dispose(){this.disposed=!0,this.cancelRender(),this.clearTrack(),this.controls.dispose(),this.drone.traverse($t),this.renderer.dispose(),this.renderer.forceContextLoss()}setActive(e){this.active=e,e?this.requestRender():this.cancelRender()}showDroneShape(){let e=this.hasAttitude&&this.model!==null;this.marker.visible=!e,this.model&&(this.model.visible=e)}disposeGround(){this.ground?.dispose(),this.ground?.group.removeFromParent(),this.ground=null}buildGround(){this.disposeGround();let e=this.track;e&&this.groundSource!==`none`&&(this.ground=Ht({box:e.box,source:It[this.groundSource],groundU:e.groundU,toLocal:(t,n)=>e.toLocal(t,n,e.origin.altM),onTileLoaded:()=>this.requestRender()}),this.ground.setTranslucent(this.belowMap),this.scene.add(this.ground.group))}updateBelowMap(){let e=this.track?.groundU;if(e===void 0||!this.drone.visible){this.setBelowMap(!1);return}this.drone.updateWorldMatrix(!1,!0),this.setBelowMap(Kt.setFromObject(this.model?.visible?this.model:this.marker).min.y<e)}setBelowMap(e){e!==this.belowMap&&(this.belowMap=e,this.ground?.setTranslucent(e))}frameTrack(){let{minN:e,maxN:t,minE:n,maxE:r,minU:i,maxU:a}=this.track.bounds,o=Math.min(i,this.track.groundU),s=Math.max(a,this.track.groundU),c=new j((e+t)/2,(s+o)/2,(n+r)/2),l=Math.max(t-e,r-n,s-o,50)*1.5;this.controls.target.copy(c),this.camera.position.copy(c).add(new j(-.8*l,.6*l,-.3*l)),this.camera.far=Math.max(2e4,l*20),this.camera.updateProjectionMatrix(),this.controls.update()}clearTrack(){this.trackObjects.traverse($t),this.trackObjects.clear(),this.disposeGround(),this.traveled=null,this.track=null,this.belowMap=!1,this.drone.visible=!1}cancelRender(){this.renderFrame!==null&&(cancelAnimationFrame(this.renderFrame),this.renderFrame=null)}requestRender(){this.renderFrame===null&&!this.disposed&&this.active&&(this.renderFrame=requestAnimationFrame(()=>{this.renderFrame=null,!this.disposed&&(this.drone.scale.setScalar(this.camera.position.distanceTo(this.drone.position)*Wt),this.updateBelowMap(),this.renderer.render(this.scene,this.camera))}))}};function $t(e){if(e instanceof O||e instanceof ue){e.geometry.dispose();let t=Array.isArray(e.material)?e.material:[e.material];for(let e of t)e.dispose()}}var en={key:0,class:`absolute inset-0 flex items-center justify-center text-sm text-(--text-secondary)`},tn=[`title`],nn={key:0,class:`absolute right-6 bottom-0.5 text-[10px] opacity-70`},rn=220,an=160,on=t({__name:`Flight3DPanel`,setup(t){let y=ge(),b=xe(),ee=_e(),{userSettings:te}=ee,ne=_(null),x=_(null),S=c(null),C=_(!1),w=_(`map`),re=[{label:`Map`,value:`map`},{label:`Satellite`,value:`satellite`},{label:`None`,value:`none`}],T=_({left:0,top:0,width:0,height:0}),E=_(``),D=_(`No GPS data in this log`),O=null,k=null,ie=null,A={},j=null,M=null,N={width:0,height:0},P=null,F=null,ae=g(()=>({left:`${T.value.left}px`,top:`${T.value.top}px`,width:`${T.value.width}px`,height:`${T.value.height}px`})),oe=g(()=>w.value===`none`?``:It[w.value].attribution);function I(e){let t=Math.min(Math.max(e.width,rn),N.width),n=Math.min(Math.max(e.height,an),N.height);return{width:t,height:n,left:Math.min(Math.max(e.left,0),N.width-t),top:Math.min(Math.max(e.top,0),N.height-n)}}function se(e,t){N={width:e,height:t};let n=te.flight3d,r=e=>Number.parseFloat(e)/100;T.value=I({left:e*r(n.left),top:t*r(n.top),width:e*r(n.width),height:t*r(n.height)})}function ce(e,t){e.button===0&&(e.preventDefault(),P={mode:t,x:e.clientX,y:e.clientY,start:{...T.value}},window.addEventListener(`pointermove`,L),window.addEventListener(`pointerup`,ue,{once:!0}))}function L(e){if(!P)return;let t=e.clientX-P.x,n=e.clientY-P.y,{start:r}=P;T.value=P.mode===`move`?I({...r,left:r.left+t,top:r.top+n}):I({...r,width:r.width+t,height:r.height+n})}function ue(){if(window.removeEventListener(`pointermove`,L),P=null,!N.width||!N.height)return;let e=(e,t)=>`${(e/t*100).toFixed(2)}%`;ee.saveSetting(`flight3d`,{left:e(T.value.left,N.width),top:e(T.value.top,N.height),width:e(T.value.width,N.width),height:e(T.value.height,N.height)})}function de(e){k=e;let t=e?.getLogIndex()??-1;e&&j?.log===e&&j.index===t||(j=e?{log:e,index:t}:null,S.value=e?Ze(e):null,D.value=e?.getMainFieldIndexByName(`GPS_coord[0]`)===void 0?`No GPS data in this log`:`No usable GPS fix in this log`,ie=e&&S.value?bt(e):null,A=e?{speed:e.getMainFieldIndexByName(`GPS_speed`),distance:e.getMainFieldIndexByName(`gpsDistance`)}:{},O?.setTrack(S.value),R(b.currentBlackboxTime))}function R(e){if(!O||!k||!S.value)return;let t=k.getCurrentFrameAtTime(e),n=t?t.current:null,r=O.setTime(e,ie?.at(e)??null),i=[];r&&i.push(`Alt ${ve.decodeCorrectAltitude(r.u-S.value.groundU,te.altitudeUnits)}`);let a=(e,t)=>ve.decodeFieldToFriendly(k,e,t,void 0);n&&A.speed!==void 0&&i.push(a(`GPS_speed`,n[A.speed])),n&&A.distance!==void 0&&i.push(`Home ${a(`gpsDistance`,n[A.distance])}`),E.value=i.join(` · `)}function z(){C.value=!C.value,O?.setFollow(C.value),R(b.currentBlackboxTime)}function pe(e){M={x:e.clientX,y:e.clientY}}function me(e){let t=M;if(M=null,!t||!O||Math.hypot(e.clientX-t.x,e.clientY-t.y)>4)return;let n=O.pickTime(e.clientX,e.clientY);n!==null&&Se(n)}return h(w,e=>O?.setGroundSource(e)),p(()=>{O?.setActive(!0),x.value&&O?.resize(x.value.clientWidth,x.value.clientHeight),R(b.currentBlackboxTime)}),e(()=>O?.setActive(!1)),m(()=>{O=new Qt(ne.value),F=new ResizeObserver(([e])=>{O?.resize(e.contentRect.width,e.contentRect.height)}),F.observe(x.value),y.flight3d={setCurrentTime:R,resize:se,setFlightLog:e=>de(i(e))};let e=y.canvasRefs?.canvas;e&&se(e.clientWidth,e.clientHeight),de(b.hasLog?i(b.flightLog):null)}),l(()=>{window.removeEventListener(`pointermove`,L),window.removeEventListener(`pointerup`,ue),F?.disconnect(),y.flight3d=null,O?.dispose(),O=null}),(e,t)=>{let i=le,c=fe,l=Te;return v(),r(`div`,{class:`absolute z-[5] flex flex-col overflow-hidden rounded border border-(--surface-300) bg-(--graph-background) shadow-lg`,style:f(ae.value)},[o(`div`,{class:`flex h-7 shrink-0 cursor-move items-center gap-1 border-b border-(--surface-300) bg-(--surface-100) px-1 select-none`,title:`Drag to move`,onPointerdown:t[2]||=e=>ce(e,`move`)},[u(i,{name:`i-lucide-grip-horizontal`,class:`text-(--text-secondary)`}),t[4]||=o(`span`,{class:`text-xs font-medium`},`3D flight`,-1),S.value?(v(),r(`div`,{key:0,class:`ml-auto flex cursor-default items-center gap-1`,onPointerdown:t[1]||=d(()=>{},[`stop`])},[u(c,{size:`xs`,variant:`soft`,color:C.value?`primary`:`neutral`,icon:`i-lucide-crosshair`,"aria-pressed":C.value,"aria-label":`Follow craft`,title:`Follow craft`,onClick:z},null,8,[`color`,`aria-pressed`]),u(l,{modelValue:w.value,"onUpdate:modelValue":t[0]||=e=>w.value=e,items:re,size:`xs`,class:`w-28`,"aria-label":`Ground layer`},null,8,[`modelValue`])],32)):s(``,!0)],32),o(`div`,{ref_key:`viewportRef`,ref:x,class:`relative min-h-0 flex-1`},[o(`canvas`,{ref_key:`canvasRef`,ref:ne,class:`absolute inset-0 block h-full w-full`,onPointerdown:pe,onPointerup:me},null,544),S.value?(v(),r(n,{key:1},[o(`div`,{class:`absolute bottom-1 left-1 rounded bg-(--surface-100)/80 px-1.5 py-0.5 text-xs tabular-nums`,title:S.value.pinned===`none`?`Altitude relative to the first position; map is a flat reference, not terrain`:`Altitude relative to takeoff; map is a flat reference, not terrain`},a(E.value),9,tn),oe.value?(v(),r(`div`,nn,a(oe.value),1)):s(``,!0)],64)):(v(),r(`div`,en,a(D.value),1))],512),o(`div`,{class:`group absolute right-0 bottom-0 h-5 w-5 cursor-se-resize`,title:`Drag to resize`,onPointerdown:t[3]||=d(e=>ce(e,`resize`),[`stop`])},[...t[5]||=[o(`div`,{class:`h-full w-full bg-(--surface-600) transition-colors [clip-path:polygon(100%_0,100%_100%,0_100%)] group-hover:bg-(--primary-500)`},null,-1),o(`svg`,{viewBox:`0 0 20 20`,class:`absolute inset-0 h-full w-full text-(--surface-50)`,"aria-hidden":`true`},[o(`path`,{d:`M9 18 18 9M13 18l5-5`,stroke:`currentColor`,"stroke-width":`1.5`,"stroke-linecap":`round`})],-1)]],32)],4)}}});export{on as default};