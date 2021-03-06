import { Precondition, JoinPoint } from '../core/join_point';
import { Advice } from '../core/advice';
import { Pointcut } from '../core/pointcut';
import { AspectRegistry, Targets, Aspect } from '../core/aspect';
import { MethodSelector } from './selectors';
import { MethodPrecondition } from './preconditions';

const BLACK_LIST = ['constructor'];

export class MethodCallJointPoint extends JoinPoint {
  public getTarget(fn: Function): any {
    return fn.prototype;
  }

  public match(target: Function): any[] {
    let keys = Object.getOwnPropertyNames(target.prototype);
    keys = keys.filter(key => {
      return BLACK_LIST.indexOf(key) < 0;
    });
    let res = keys
      .map(key => {
        let descriptor = Object.getOwnPropertyDescriptor(target.prototype, key);
        if (
          this.precondition.assert({
            classDefinition: target,
            methodName: key,
          }) &&
          typeof descriptor.value === 'function'
        ) {
          return key;
        }
        return false;
      })
      .filter(val => !!val);
    return res;
  }

  protected woveTarget(proto: { [key: string]: any }, key: string, advice: Advice, woveMetadata: any) {
    let className = proto.constructor.name;
    let bak = proto[key];
    let self = this;

    const proxy: any = function() {
      let metadata = self.getMetadata(className, key, bak, arguments, this, woveMetadata);
      return advice.wove(bak, metadata);
    };
    proxy.__woven__ = true;
    proxy.__bak__ = bak;
    proto[key] = proxy;

    // Copy reflect-metadata for decorators that use the descriptor value.
    Reflect.getMetadataKeys(bak).forEach((key: any) => {
      const value = Reflect.getMetadata(key, bak);
      Reflect.defineMetadata(key, value, proxy);
    });
  }
}

export function makeMethodCallAdviceDecorator(constr: any) {
  return function(...selectors: MethodSelector[]): MethodDecorator {
    return function<T>(target: Object, prop: symbol | string, descriptor: TypedPropertyDescriptor<T>) {
      let jointpoints = selectors.map(selector => {
        return new MethodCallJointPoint(new MethodPrecondition(selector));
      });
      let pointcut = new Pointcut();
      pointcut.advice = <Advice>new constr(target, descriptor.value);
      pointcut.joinPoints = jointpoints;
      let aspectName = target.constructor.name;
      let aspect = AspectRegistry.get(aspectName) || new Aspect();
      aspect.pointcuts.push(pointcut);
      AspectRegistry.set(aspectName, aspect);
      // For lazy loading
      Targets.forEach(({ target, config }) => aspect.wove(target, config));
      return target;
    };
  };
}
