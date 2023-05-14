作者：Gaubee
链接：https://www.zhihu.com/question/357285402/answer/2446108087
来源：知乎
著作权归作者所有。商业转载请联系作者获得授权，非商业转载请注明出处。

/**
 * 订阅器
 * 提供一个流式的变更触发
 * 等价于 EventEmitter
 * 这里提供基于流式编程的书写方法
 */
interface Sub {
  /**
   * 如果是 true，说明已经发生修改，只是这个改变还没有被拾取
   * 如果是 false，说明改变已经被拾取
   * 如果是 PromiseOut，说明有控制器在等待它
   */
  changed: boolean | PromiseOut<void>;
}
class Demo {
  private _subs = new Set<Sub>();
  /*触发修改*/
  emitChanged() {
    for (const sub of this._subs) {
      // 如果有等待中的控制器，那么唤醒它
      if (sub.changed instanceof PromiseOut) {
        sub.changed.resolve();
      }
      // 修改状态值：有改变
      sub.changed = true;
    }
  }
  /**
   * 执行订阅
   */
  async *subscription() {
    const sub: Sub = { changed: false };
    this._subs.add(sub);
    do {
      /// 如果是 true 那么就重置成 false
      if (sub.changed === true) {
        sub.changed = false;
        yield; /// 异步迭代器暂停，将控制权转交给外部迭代者
      }
      /// 暂停期间可能会被修改成 true（调用了emitChanged）
      /// 如果还是 false，说明期间没有发生任何修改
      if (sub.changed === false) {
        // 创建一个控制器并等待它被唤醒
        await (sub.changed = new PromiseOut<void>()).promise;
        sub.changed = true;
      }
    } while (true);
  }
}